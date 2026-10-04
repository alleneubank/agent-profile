#!/usr/bin/env bash
# Send one line of agent mail into another agent's sox shell, with a header
# naming its sender and kind, and record a receipt in the sender's log.
#
#   send.sh --from "<charter> <role>" --to HOST/sN.gM --expect-fg CMD \
#           --kind event|request|evidence|relay --log PATH \
#           [--lease PATH --session S --shell HOST/sN.gM] < message
#
# The message is one line on stdin. With --lease, the sender must hold the
# watch (lease.sh check) and the header carries the watch number; a relay
# requires it. The line typed into the target reads:
#   [<charter> <role> watch<N> → <target>; <kind>] <message>
#
# Exit: 0 sent, 2 usage, 4 sender does not hold the watch, otherwise sox's
# exit code. SOX_BIN overrides the sox binary (tests); the home is pinned.
set -eu

usage() {
  sed -n '5,7p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

here=$(cd "$(dirname "$0")" && pwd)
from="" to="" expect_fg="" kind="" log="" lease="" session="" shell=""
while [ $# -gt 0 ]; do
  [ $# -ge 2 ] || usage
  case "$1" in
    --from) from=$2 ;;
    --to) to=$2 ;;
    --expect-fg) expect_fg=$2 ;;
    --kind) kind=$2 ;;
    --log) log=$2 ;;
    --lease) lease=$2 ;;
    --session) session=$2 ;;
    --shell) shell=$2 ;;
    *) usage ;;
  esac
  shift 2
done
[ -n "$from" ] && [ -n "$to" ] && [ -n "$expect_fg" ] && [ -n "$kind" ] && [ -n "$log" ] || usage
case "$kind" in event|request|evidence|relay) ;; *) usage ;; esac
if [ "$kind" = relay ] && [ -z "$lease" ]; then
  echo "send.sh: a relay needs --lease: only the holder of the watch relays" >&2
  exit 2
fi

message=$(cat)
case "$message" in
  ""|*"
"*) echo "send.sh: the message must be exactly one non-empty line" >&2; exit 2 ;;
esac

watch=""
if [ -n "$lease" ]; then
  [ -n "$session" ] && [ -n "$shell" ] || usage
  "$here/lease.sh" check "$lease" --session "$session" --shell "$shell"
  watch=" watch$(sed -n 's/^watch=//p' "$lease" | head -n 1)"
fi

line="[$from$watch → $to; $kind] $message"
if command -v sha256sum >/dev/null; then hasher="sha256sum"; else hasher="shasum -a 256"; fi
sha=$(printf '%s' "$line" | $hasher | cut -c1-12)
stamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Run from /tmp so no directory's .envrc re-points the sox home.
status=0
(cd /tmp && printf '%s' "$line" | env SOX_HOME="$HOME/.sox" "${SOX_BIN:-sox}" send "$to" --expect-fg "$expect_fg" --enter) || status=$?
if [ "$status" -eq 0 ]; then
  printf '%s sent %s from %s%s to %s sha=%s\n' "$stamp" "$kind" "$from" "$watch" "$to" "$sha" >> "$log"
else
  printf '%s failed %s from %s%s to %s sha=%s exit=%s\n' "$stamp" "$kind" "$from" "$watch" "$to" "$sha" "$status" >> "$log"
fi
exit "$status"
