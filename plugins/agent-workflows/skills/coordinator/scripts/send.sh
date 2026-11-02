#!/usr/bin/env bash
# Send one line of agent mail into another agent's sox shell, with a header
# naming its sender and kind, and record a receipt.
#
#   send.sh --charter C --role coordinator|<lane> --to [HOST/]sN.gM \
#           --kind event|request|evidence|relay [--wake-stood-down] < message
#
# The line typed into the target reads:
#   [<charter> <role>[ watch<N>] → <target>; <kind>] <message>
#
# A coordinator must hold the charter's watch (lease.sh check) for every kind
# but evidence, and its header carries the watch number; only the coordinator
# relays. The target must be a live shell where an agent has reported an
# attention state; a bare shell would run the line as a command. sox refuses
# the write if the target's foreground changes after the check. The receipt
# goes to $COORDINATION_HOME/<charter>/sent.log (~/.handoffs by default) on
# this host.
#
# A target on this host that a lease names as its coordinator's shell is
# refused while that coordinator is stood down: its watch released, or a
# lease State other than live. A typed line would start a turn the human did
# not ask for. The leases come from the target itself: lease.sh labels the
# shell each lease names with lease.<charter>=<lease path>, so a charter's
# lease is found whatever coordination home it lives under. A label whose
# lease no longer names the shell is ignored. The sender's own charter's
# lease decides when it names the target; otherwise one live lease naming the
# shell keeps it reachable, since a session may coordinate several charters.
# --wake-stood-down sends anyway, on the human's word only, and the receipt
# says so. A refusal is recorded.
#
# Exit: 0 sent, 2 usage, 3 no lease, 4 sender does not hold the watch,
# 5 target is a stood-down coordinator, 6 target not found, not running an
# agent, or its labels unreadable, otherwise sox's exit code.
# Tests override COORDINATION_HOME, SOX_BIN and SEND_HOSTNAME; the sox home is
# pinned.
set -eu

MESSAGE_BYTES_MAX=2000

usage() {
  sed -n '5,6p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

fail() {
  echo "send.sh: $1" >&2
  exit "$2"
}

# Run sox from /tmp so no directory's .envrc re-points the sox home.
sox_pinned() {
  (cd /tmp && env SOX_HOME="$HOME/.sox" "${SOX_BIN:-sox}" "$@")
}

here=$(cd "$(dirname "$0")" && pwd)
coordination=${COORDINATION_HOME:-$HOME/.handoffs}
charter="" role="" to="" kind="" wake=""
while [ $# -gt 0 ]; do
  if [ "$1" = --wake-stood-down ]; then
    wake=yes
    shift
    continue
  fi
  [ $# -ge 2 ] || usage
  case "$1" in
    --charter) charter=$2 ;;
    --role) role=$2 ;;
    --to) to=$2 ;;
    --kind) kind=$2 ;;
    *) usage ;;
  esac
  shift 2
done
[ -n "$charter" ] && [ -n "$role" ] && [ -n "$to" ] && [ -n "$kind" ] || usage
case "$charter" in *[!A-Za-z0-9._-]*|.*) fail "charter must be a plain name like op-forward" 2 ;; esac
case "$role" in *[!A-Za-z0-9._-]*) fail "role must be a plain name like coordinator or glyphs" 2 ;; esac
case "$kind" in event|request|evidence|relay) ;; *) usage ;; esac
if [ "$kind" = relay ] && [ "$role" != coordinator ]; then
  fail "only the coordinator relays a human decision" 2
fi

message=$(cat)
case "$message" in
  ""|*"
"*) fail "the message must be exactly one non-empty line" 2 ;;
esac
[ "$(printf '%s' "$message" | wc -c)" -le "$MESSAGE_BYTES_MAX" ] || fail "the message exceeds $MESSAGE_BYTES_MAX bytes: send a pointer to a file" 2

watch=""
if [ "$role" = coordinator ] && [ "$kind" != evidence ]; then
  "$here/lease.sh" check "$charter"
  watch=" watch$(sed -n 's/^watch=//p' "$coordination/$charter/lease" | head -n 1)"
fi

# The target's row, from its own host's daemon. A bare target is this
# machine's shell.
case "$to" in
  */*) host=${to%%/*} backing=${to#*/} ;;
  *) host=localhost backing=$to ;;
esac

# stood_down <lease>: why the coordinator that lease names is stood down, or
# nothing when it is live. A lease with no State predates the field: live.
stood_down() {
  released=$(sed -n 's/^released_at=//p' "$1" | head -n 1)
  state=$(sed -n 's/^state=//p' "$1" | head -n 1)
  if [ -n "$released" ]; then
    printf 'watch released at %s' "$released"
  elif [ -n "$state" ] && [ "$state" != live ]; then
    printf '%s' "$state"
  fi
}

# refusal_for <lease>: the refusal for a stood-down lease, or nothing.
refusal_for() {
  why=$(stood_down "$1")
  [ -n "$why" ] || return 0
  owner=$(sed -n 's/^charter=//p' "$1" | head -n 1)
  printf "%s is the %s coordinator, stood down (%s): leave it in %s's charter or log for its next start; --wake-stood-down only on the human's word" \
    "$to" "$owner" "$why" "$owner"
}

row=$(sox_pinned ls "$host" --json 2>/dev/null | grep -F "\"backing_id\":\"$backing\"" |
  grep -F '"status":"live"' | head -n 1) || true
[ -n "$row" ] || fail "no live shell $to: check sox ls $host" 6
# An agent's plugin reports attention; a bare shell has none. The command
# alone cannot tell them apart: an agent under a wrapper script shows as zsh.
case "$row" in
  *'"attention":null'*|*'"attention":""'*) fail "no agent has reported in $to: relaunch the agent first" 6 ;;
  *'"attention":"'*) ;;
  *) fail "$to's attention state could not be read" 6 ;;
esac
foreground=$(printf '%s\n' "$row" | sed -n 's/.*"command":"\([^"]*\)".*/\1/p')
[ -n "$foreground" ] || fail "$to's foreground command could not be sampled" 6

# names_target <lease>: 0 when that lease names the target as its shell.
names_target() {
  [ -f "$1" ] && grep -qxF "shell=$backing" "$1"
}

# Leases and their paths are this host's, so only a target here can match.
refusal=""
if [ "$host" = localhost ] || [ "$host" = "${SEND_HOSTNAME:-$(hostname -s)}" ]; then
  labels=$(sox_pinned label "$backing") || fail "$to's labels could not be read: check sox label $backing" 6
  own=$(printf '%s\n' "$labels" | awk -v key="lease.$charter=" 'index($0, key) == 1 { print substr($0, length(key) + 1) }')
  if [ -n "$own" ] && names_target "$own"; then
    refusal=$(refusal_for "$own")
  else
    leases=$(printf '%s\n' "$labels" | awk 'index($0, "lease.") == 1 { sub(/^[^=]*=/, ""); print }')
    # sox label values hold no whitespace, so each line is one whole path.
    while IFS= read -r lease; do
      names_target "$lease" || continue
      refusal=$(refusal_for "$lease")
      [ -n "$refusal" ] || break
    done <<EOF
$leases
EOF
  fi
fi

line="[$charter $role$watch → $to; $kind] $message"
if command -v sha256sum >/dev/null; then hasher="sha256sum"; else hasher="shasum -a 256"; fi
sha=$(printf '%s' "$line" | $hasher | cut -c1-12)
stamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
log="$coordination/$charter/sent.log"
woke=""
[ -z "$wake" ] || woke=" wake-stood-down"
mkdir -p "$(dirname "$log")"
if [ -n "$refusal" ] && [ -z "$wake" ]; then
  printf '%s refused %s from %s %s%s to %s sha=%s stood-down\n' "$stamp" "$kind" "$charter" "$role" "$watch" "$to" "$sha" >> "$log"
  fail "$refusal" 5
fi

status=0
printf '%s' "$line" | sox_pinned send "$to" --expect-fg "$foreground" --enter || status=$?
if [ "$status" -eq 0 ]; then
  printf '%s sent %s from %s %s%s to %s sha=%s%s\n' "$stamp" "$kind" "$charter" "$role" "$watch" "$to" "$sha" "$woke" >> "$log"
else
  printf '%s failed %s from %s %s%s to %s sha=%s exit=%s\n' "$stamp" "$kind" "$charter" "$role" "$watch" "$to" "$sha" "$status" >> "$log"
fi
exit "$status"
