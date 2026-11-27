#!/usr/bin/env bash
# Hooks for a session that holds a coordinator-type watch: a coordinator,
# fleet-watch, or chief-of-staff lease. The event name arrives as $1.
#
#   PreToolUse (matcher AskUserQuestion): deny the question widget while the
#     human is away, and tell the agent to queue the question instead. A
#     coordinator frozen on an open question cannot land or refill lanes, and
#     sox refuses agent mail to it.
#   SessionStart (matcher compact): after a compaction, tell the agent to
#     reload its role skill, re-read its charter, and prune it.
#
# Scope: the session holds a watch when an unreleased lease under the
# coordination home ($COORDINATION_HOME, ~/Work/.handoffs by default) records the
# hook's session_id; lease.sh writes the Claude Code session id there. Every
# other session (attended work, lanes, released watches) gets no output.
#
# Presence, in order:
#   1. `sox presence --json` reports {"state":"here"} or {"state":"away"}.
#   2. sox has a presence command (`sox help presence` succeeds) but the call
#      failed, timed out, or printed no state: treated as away.
#   3. sox or its presence command is missing: COORDINATOR_QUIET_HOURS, a
#      window and an IANA zone such as "22:00-07:00 America/New_York", decides;
#      unset or malformed means no quiet hours, so the question is allowed.
#
# Exception: while the human is away, a question whose text starts with
# "[nothing else ready: <reason>]" opens anyway, for a charter where nothing
# else can proceed. The hook appends the reason, time, and session to the
# charter's log.md, and the human sees the tag in the widget.
#
# Fail-open by design outside step 2: malformed hook input, an unreadable
# coordination home, or a host without sox presence never removes the widget.
# Tests override COORDINATION_HOME and SOX_BIN.
set -uo pipefail

event="${1:-}"
input="$(cat 2>/dev/null)" || input=""

readonly PRESENCE_TIMEOUT_SECONDS=2
readonly PRESENCE_HELP_TIMEOUT_SECONDS=1
readonly EXCEPTION_TAG='[nothing else ready: '
readonly QUIET_HOURS_FORMAT='^[[:space:]]*([0-9]{2}):([0-9]{2})-([0-9]{2}):([0-9]{2})[[:space:]]+([A-Za-z0-9_+/-]+)[[:space:]]*$'

session="$(printf '%s' "$input" | sed -n -E 's/.*"session_id"[[:space:]]*:[[:space:]]*"([A-Za-z0-9._-]+)".*/\1/p' | head -n 1)"
[[ -n "$session" ]] || exit 0
# Without a home there is no coordination home and no sox home to look in.
[[ -n "${HOME:-}" ]] || exit 0

# The lease file of the first unreleased watch this session holds, if any.
# awk stops at the first file it cannot open, so an unreadable or dangling
# lease in another charter is left out instead of hiding the ones after it.
leases=()
shopt -s nullglob
for lease in "${COORDINATION_HOME:-$HOME/Work/.handoffs}"/*/lease; do
    [[ -f "$lease" && -r "$lease" ]] && leases+=("$lease")
done
shopt -u nullglob
[[ ${#leases[@]} -gt 0 ]] || exit 0
held_lease="$(awk -v holder="session=$session" '
    FNR == 1 { if (held && !released) { print previous; exit } held = 0; released = 0 }
    { previous = FILENAME }
    $0 == holder { held = 1 }
    /^released_at=./ { released = 1 }
    END { if (held && !released) print previous }
' "${leases[@]}" 2>/dev/null | head -n 1)"
[[ -n "$held_lease" ]] || exit 0
charter_dir="$(dirname "$held_lease")"

# run_bounded <seconds> <command...>: run the command from /tmp with the sox
# home pinned (as lease.sh does), stdout passed through, and stop it once the
# deadline passes. Returns its exit status, or the signal status on timeout.
run_bounded() {
    local seconds=$1 pid watchdog status
    shift
    (cd /tmp && exec env SOX_HOME="$HOME/.sox" "$@") 2>/dev/null &
    pid=$!
    (
        trap 'kill "$sleeper" 2>/dev/null; exit 0' TERM
        sleep "$seconds" &
        sleeper=$!
        wait "$sleeper"
        kill "$pid" 2>/dev/null
    ) >/dev/null 2>&1 &
    watchdog=$!
    wait "$pid"
    status=$?
    kill "$watchdog" 2>/dev/null
    wait "$watchdog" 2>/dev/null
    return "$status"
}

# presence: here, away, unreadable (sox has the command but gave no state),
# or unavailable (no sox, or a sox without the command).
presence() {
    local sox_bin="${SOX_BIN:-sox}" report state
    if ! command -v "$sox_bin" >/dev/null 2>&1; then
        echo unavailable
        return
    fi
    report="$(run_bounded "$PRESENCE_TIMEOUT_SECONDS" "$sox_bin" presence --json)"
    # The first "state" is the report's own; nested objects come after it.
    state="$(printf '%s' "$report" | grep -o -E '"state"[[:space:]]*:[[:space:]]*"(here|away)"' | head -n 1)"
    state="${state%\"}"
    state="${state##*\"}"
    if [[ -n "$state" ]]; then
        echo "$state"
    elif run_bounded "$PRESENCE_HELP_TIMEOUT_SECONDS" "$sox_bin" help presence >/dev/null; then
        echo unreadable
    else
        echo unavailable
    fi
}

# in_quiet_hours: 0 when COORDINATOR_QUIET_HOURS is well formed and the
# current time in its zone falls inside the window; the window may cross
# midnight.
in_quiet_hours() {
    local window="${COORDINATOR_QUIET_HOURS:-}" zone start end now
    [[ "$window" =~ $QUIET_HOURS_FORMAT ]] || return 1
    zone="${BASH_REMATCH[5]}"
    start=$((10#${BASH_REMATCH[1]} * 60 + 10#${BASH_REMATCH[2]}))
    end=$((10#${BASH_REMATCH[3]} * 60 + 10#${BASH_REMATCH[4]}))
    (( 10#${BASH_REMATCH[1]} < 24 && 10#${BASH_REMATCH[3]} < 24 )) || return 1
    (( 10#${BASH_REMATCH[2]} < 60 && 10#${BASH_REMATCH[4]} < 60 )) || return 1
    (( start != end )) || return 1
    # date falls back to UTC for an unknown zone, so require the zone's file.
    [[ "$zone" == UTC || -f "/usr/share/zoneinfo/$zone" ]] || return 1
    now="$(TZ="$zone" date +%H:%M)" || return 1
    now=$((10#${now%%:*} * 60 + 10#${now##*:}))
    if (( start < end )); then
        (( now >= start && now < end ))
    else
        (( now >= start || now < end ))
    fi
}

# json_string <text>: the text with JSON string escapes for \ and ".
json_string() {
    local text=${1//\\/\\\\}
    printf '%s' "${text//\"/\\\"}"
}

# stated_exception: the reason in the first question text that starts with
# the exception tag, empty when none does. A reason ends at the closing
# bracket, a quote, or a backslash, so it stays one line of plain text.
stated_exception() {
    local pattern='"question"[[:space:]]*:[[:space:]]*"\[nothing else ready: ([^]"\\]*[^][:space:]"\\][^]"\\]*)\]'
    [[ "$input" =~ $pattern ]] && printf '%s' "${BASH_REMATCH[1]}"
}

# deny_question <why away>: allow the question when it states the exception,
# recording it in the charter log; otherwise deny it.
deny_question() {
    local exception reason
    exception="$(stated_exception)"
    if [[ -n "$exception" ]]; then
        printf '\n- %s question widget opened while away (%s) by session %s, nothing else ready: %s\n' \
            "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$session" "$exception" >> "$charter_dir/log.md" ||
            echo "coordinator-session: could not record the exception in $charter_dir/log.md" >&2
        exit 0
    fi
    reason="Do not open a question now: $1. Add it to the \"Waiting on the human\" list in $charter_dir/log.md and continue with other ready work; ask it in a decision round once the human is here. Only if nothing else in the charter can proceed, retry with the question's text starting with \"${EXCEPTION_TAG}<why>]\"; the reason is recorded in that log."
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' \
        "$(json_string "$reason")"
    exit 0
}

case "$event" in
    PreToolUse)
        case "$(presence)" in
            here) exit 0 ;;
            away) deny_question "sox presence says the human is away" ;;
            unreadable) deny_question "sox presence could not be read, so the human counts as away" ;;
            unavailable)
                if in_quiet_hours; then
                    deny_question "it is inside COORDINATOR_QUIET_HOURS and sox presence is unavailable"
                fi
                exit 0
                ;;
        esac
        ;;
    SessionStart)
        # The matcher selects compaction; a harness that ignores matchers
        # must not send this at startup or resume.
        [[ "$input" =~ \"source\"[[:space:]]*:[[:space:]]*\"compact\" ]] || exit 0
        context="This session holds the watch recorded in $held_lease and its context was just compacted. Before anything else: invoke the skill for that role again (coordinator, fleet-watch, or chief-of-staff), re-read the charter, log, lease, and lane state, assume nothing is armed, and prune the charter (the coordinator skill's Pruning, and the fleet file's rules for charters)."
        printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' \
            "$(json_string "$context")"
        ;;
    *) ;;
esac
exit 0
