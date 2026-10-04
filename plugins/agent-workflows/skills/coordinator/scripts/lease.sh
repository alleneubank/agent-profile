#!/usr/bin/env bash
# The coordinator lease: which session holds a charter's watch.
#
#   lease.sh show    <lease>
#   lease.sh take    <lease> --charter C --session S --shell HOST/sN.gM --harness H --reason TEXT
#   lease.sh check   <lease> --session S --shell HOST/sN.gM
#   lease.sh release <lease> --session S --shell HOST/sN.gM --handoff PATH
#
# Exit: 0 ok, 2 usage, 3 no lease, 4 caller does not hold the watch, 5 lease busy.
#
# The file is key=value lines in a fixed order. Writes take a lock directory
# and replace the file by rename, so a reader never sees half a lease and two
# takes never both succeed. LEASE_NOW overrides the clock (tests).
set -eu

FIELDS="charter watch session shell harness taken_at prior reason released_at handoff"

usage() {
  sed -n '3,9p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

now() {
  if [ -n "${LEASE_NOW:-}" ]; then printf '%s\n' "$LEASE_NOW"; else date -u +%Y-%m-%dT%H:%M:%SZ; fi
}

# field <lease> <key>: the value of one key, empty when absent.
field() {
  sed -n "s/^$2=//p" "$1" | head -n 1
}

# One line only: a newline inside a value would forge another key.
one_line() {
  case "$2" in
    *"
"*) echo "lease.sh: --$1 must be one line" >&2; exit 2 ;;
  esac
}

lock() {
  if ! mkdir "$1.lock" 2>/dev/null; then
    echo "lease.sh: $1 is being written by another process" >&2
    exit 5
  fi
  trap 'rmdir "'"$1"'.lock" 2>/dev/null || true' EXIT
}

# write <lease> <one value per FIELDS key, in order>: replace the lease,
# leaving out empty values.
write() {
  target=$1 tmp="$1.tmp.$$"
  shift
  : > "$tmp"
  for key in $FIELDS; do
    if [ -n "$1" ]; then printf '%s=%s\n' "$key" "$1" >> "$tmp"; fi
    shift
  done
  mv -f "$tmp" "$target"
}

holds() {
  # holds <lease> <session> <shell>: 0 when the caller holds an unreleased watch.
  [ -f "$1" ] || return 1
  [ -z "$(field "$1" released_at)" ] || return 1
  [ "$(field "$1" session)" = "$2" ] && [ "$(field "$1" shell)" = "$3" ]
}

[ $# -ge 2 ] || usage
command=$1 lease=$2
shift 2

charter="" session="" shell="" harness="" reason="" handoff=""
while [ $# -gt 0 ]; do
  [ $# -ge 2 ] || usage
  case "$1" in
    --charter) charter=$2 ;;
    --session) session=$2 ;;
    --shell) shell=$2 ;;
    --harness) harness=$2 ;;
    --reason) reason=$2 ;;
    --handoff) handoff=$2 ;;
    *) usage ;;
  esac
  one_line "${1#--}" "$2"
  shift 2
done

case "$command" in
  show)
    if [ ! -f "$lease" ]; then echo "lease.sh: no lease at $lease" >&2; exit 3; fi
    cat "$lease"
    ;;

  take)
    [ -n "$charter" ] && [ -n "$session" ] && [ -n "$shell" ] && [ -n "$harness" ] && [ -n "$reason" ] || usage
    lock "$lease"
    watch=0 prior=""
    if [ -f "$lease" ]; then
      watch=$(field "$lease" watch)
      prior="$(field "$lease" session) $(field "$lease" shell) watch $watch"
    fi
    case "$watch" in ''|*[!0-9]*) echo "lease.sh: $lease has no numeric watch" >&2; exit 2 ;; esac
    write "$lease" "$charter" $((watch + 1)) "$session" "$shell" "$harness" "$(now)" "$prior" "$reason" "" ""
    cat "$lease"
    ;;

  check)
    [ -n "$session" ] && [ -n "$shell" ] || usage
    if [ ! -f "$lease" ]; then echo "lease.sh: no lease at $lease" >&2; exit 3; fi
    if holds "$lease" "$session" "$shell"; then exit 0; fi
    if [ -n "$(field "$lease" released_at)" ]; then
      echo "lease.sh: watch $(field "$lease" watch) was released at $(field "$lease" released_at)" >&2
    else
      echo "lease.sh: watch $(field "$lease" watch) is held by $(field "$lease" session) at $(field "$lease" shell)" >&2
    fi
    exit 4
    ;;

  release)
    [ -n "$session" ] && [ -n "$shell" ] && [ -n "$handoff" ] || usage
    if [ ! -f "$lease" ]; then echo "lease.sh: no lease at $lease" >&2; exit 3; fi
    lock "$lease"
    if ! holds "$lease" "$session" "$shell"; then
      echo "lease.sh: only the holder of watch $(field "$lease" watch) may release it" >&2
      exit 4
    fi
    write "$lease" "$(field "$lease" charter)" "$(field "$lease" watch)" "$(field "$lease" session)" \
      "$(field "$lease" shell)" "$(field "$lease" harness)" "$(field "$lease" taken_at)" \
      "$(field "$lease" prior)" "$(field "$lease" reason)" "$(now)" "$handoff"
    ;;

  *) usage ;;
esac
