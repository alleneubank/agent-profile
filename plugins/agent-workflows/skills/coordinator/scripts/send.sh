#!/usr/bin/env bash
# Send one line of agent mail into another agent's sox shell, with a header
# naming its sender and kind, and record a receipt.
#
#   send.sh --charter C --role coordinator|<lane> --to [HOST/]sN.gM \
#           --kind event|request|evidence|relay < message
#
# The line typed into the target reads:
#   [<charter> <role>[ watch<N>] → <target>; <kind>] <message>
#
# A coordinator must hold the charter's watch (lease.sh check) for every kind
# but evidence, and its header carries the watch number; only the coordinator
# relays. The target must be a live shell where an agent has reported an
# attention state; a bare shell would run the line as a command. sox refuses
# the write if the target's foreground changes after the check. The receipt
# goes to ~/.handoffs/<charter>/sent.log on this host.
#
# Exit: 0 sent, 2 usage, 3 no lease, 4 sender does not hold the watch,
# 6 target not found or not running an agent, otherwise sox's exit code.
# Tests override COORDINATION_HOME and SOX_BIN; the sox home is pinned.
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
charter="" role="" to="" kind=""
while [ $# -gt 0 ]; do
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
  watch=" watch$(sed -n 's/^watch=//p' "${COORDINATION_HOME:-$HOME/.handoffs}/$charter/lease" | head -n 1)"
fi

# The target's row, from its own host's daemon. A bare target is this
# machine's shell.
case "$to" in
  */*) host=${to%%/*} backing=${to#*/} ;;
  *) host=localhost backing=$to ;;
esac
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

line="[$charter $role$watch → $to; $kind] $message"
if command -v sha256sum >/dev/null; then hasher="sha256sum"; else hasher="shasum -a 256"; fi
sha=$(printf '%s' "$line" | $hasher | cut -c1-12)
stamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
log="${COORDINATION_HOME:-$HOME/.handoffs}/$charter/sent.log"
mkdir -p "$(dirname "$log")"

status=0
printf '%s' "$line" | sox_pinned send "$to" --expect-fg "$foreground" --enter || status=$?
if [ "$status" -eq 0 ]; then
  printf '%s sent %s from %s %s%s to %s sha=%s\n' "$stamp" "$kind" "$charter" "$role" "$watch" "$to" "$sha" >> "$log"
else
  printf '%s failed %s from %s %s%s to %s sha=%s exit=%s\n' "$stamp" "$kind" "$charter" "$role" "$watch" "$to" "$sha" "$status" >> "$log"
fi
exit "$status"
