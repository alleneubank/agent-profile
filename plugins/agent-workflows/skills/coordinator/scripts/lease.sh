#!/usr/bin/env bash
# The coordinator lease: which session holds a charter's watch.
#
#   lease.sh show    <charter>
#   lease.sh take    <charter> --reason TEXT
#   lease.sh check   <charter>
#   lease.sh release <charter> --handoff PATH
#   lease.sh list
#
# list prints one tab-separated line per charter with a lease on this host:
# charter, watch, held or released, session, shell, taken_at.
#
# Exit: 0 ok, 2 usage, 3 no lease, 4 caller does not hold the watch, 5 lease busy.
#
# The lease is ~/.handoffs/<charter>/lease. The caller is this Claude Code
# session (CLAUDE_CODE_SESSION_ID) in the sox shell `sox which` names, so a
# caller cannot claim another's identity by passing it. The file is key=value
# lines in a fixed order. Writes take a lock directory and replace the file by
# rename, so a reader never sees half a lease and two takes never both
# succeed. Tests override COORDINATION_HOME, SOX_BIN and LEASE_NOW.
set -eu

FIELDS="charter watch session shell harness taken_at prior reason released_at handoff"

usage() {
  sed -n '4,8p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

fail() {
  echo "lease.sh: $1" >&2
  exit "$2"
}

now() {
  if [ -n "${LEASE_NOW:-}" ]; then printf '%s\n' "$LEASE_NOW"; else date -u +%Y-%m-%dT%H:%M:%SZ; fi
}

# field <key>: the value of one key in the lease, empty when absent.
field() {
  sed -n "s/^$1=//p" "$lease" | head -n 1
}

# One line only: a newline inside a value would forge another key.
one_line() {
  case "$2" in
    *"
"*) fail "--$1 must be one line" 2 ;;
  esac
}

# caller: set session and shell to this process's Claude Code session and
# sox shell. Run from /tmp so no directory's .envrc re-points the sox home.
caller() {
  session=${CLAUDE_CODE_SESSION_ID:-}
  [ -n "$session" ] || fail "no CLAUDE_CODE_SESSION_ID: coordinators run in Claude Code" 2
  shell=$(cd /tmp && env SOX_HOME="$HOME/.sox" "${SOX_BIN:-sox}" which $$) ||
    fail "sox which could not name this process's shell: run the coordinator in a sox shell" 2
  [ -n "$shell" ] || fail "sox which named no shell" 2
}

lock() {
  mkdir "$lease.lock" 2>/dev/null || fail "$lease is being written by another process" 5
  trap 'rmdir "$lease.lock" 2>/dev/null || true' EXIT
}

# write <one value per FIELDS key, in order>: replace the lease, leaving out
# empty values.
write() {
  tmp="$lease.tmp.$$"
  : > "$tmp"
  for key in $FIELDS; do
    if [ -n "$1" ]; then printf '%s=%s\n' "$key" "$1" >> "$tmp"; fi
    shift
  done
  mv -f "$tmp" "$lease"
}

# holds: 0 when the caller holds an unreleased watch.
holds() {
  [ -z "$(field released_at)" ] && [ "$(field session)" = "$session" ] && [ "$(field shell)" = "$shell" ]
}

# list: every lease under the coordination home, in charter-name order.
if [ "${1:-}" = list ]; then
  [ $# -eq 1 ] || usage
  LC_ALL=C
  for lease in "${COORDINATION_HOME:-$HOME/.handoffs}"/*/lease; do
    [ -f "$lease" ] || continue
    if [ -n "$(field released_at)" ]; then held=released; else held=held; fi
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$(field charter)" "$(field watch)" "$held" \
      "$(field session)" "$(field shell)" "$(field taken_at)"
  done
  exit 0
fi

[ $# -ge 2 ] || usage
command=$1 charter=$2
shift 2
case "$charter" in ''|*[!A-Za-z0-9._-]*|.*) fail "charter must be a plain name like op-forward" 2 ;; esac
dir="${COORDINATION_HOME:-$HOME/.handoffs}/$charter"
lease="$dir/lease"

reason="" handoff=""
while [ $# -gt 0 ]; do
  [ $# -ge 2 ] || usage
  case "$1" in
    --reason) reason=$2 ;;
    --handoff) handoff=$2 ;;
    *) usage ;;
  esac
  one_line "${1#--}" "$2"
  shift 2
done

case "$command" in
  show)
    [ -f "$lease" ] || fail "no lease at $lease" 3
    cat "$lease"
    ;;

  take)
    [ -n "$reason" ] || usage
    caller
    [ -d "$dir" ] || fail "no charter directory at $dir" 3
    lock
    watch=0 prior=""
    if [ -f "$lease" ]; then
      watch=$(field watch)
      prior="$(field session) $(field shell) watch $watch"
    fi
    case "$watch" in ''|*[!0-9]*) fail "$lease has no numeric watch" 2 ;; esac
    write "$charter" $((watch + 1)) "$session" "$shell" "${AI_AGENT:-claude-code}" "$(now)" "$prior" "$reason" "" ""
    cat "$lease"
    ;;

  check)
    caller
    [ -f "$lease" ] || fail "no lease at $lease" 3
    holds && exit 0
    if [ -n "$(field released_at)" ]; then
      fail "watch $(field watch) was released at $(field released_at)" 4
    fi
    fail "watch $(field watch) is held by $(field session) at $(field shell)" 4
    ;;

  release)
    [ -n "$handoff" ] || usage
    caller
    [ -f "$lease" ] || fail "no lease at $lease" 3
    lock
    holds || fail "only the holder of watch $(field watch) may release it" 4
    write "$(field charter)" "$(field watch)" "$(field session)" "$(field shell)" "$(field harness)" \
      "$(field taken_at)" "$(field prior)" "$(field reason)" "$(now)" "$handoff"
    ;;

  *) usage ;;
esac
