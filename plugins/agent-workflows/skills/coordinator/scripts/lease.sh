#!/usr/bin/env bash
# The coordinator lease: which session holds a charter's watch.
#
#   lease.sh show    <charter>
#   lease.sh take    <charter> --reason TEXT
#   lease.sh check   <charter>
#   lease.sh release <charter> --handoff PATH
#   lease.sh list
#   lease.sh state   <charter> --state live|blocked-on-human|parked --fleet PATH [--fleet-host HOST]
#
# list prints one tab-separated line per charter with a lease on this host:
# charter, watch, held or released, session, shell, taken_at.
#
# Exit: 0 ok, 2 usage, 3 no lease, 4 caller does not hold the watch, 5 lease busy,
# 6 blocked-on-human refused: the charter's queue still has a ready item.
#
# The lease is ~/.handoffs/<charter>/lease. The caller is this Claude Code
# session (CLAUDE_CODE_SESSION_ID) in the sox shell `sox which` names, so a
# caller cannot claim another's identity by passing it. `state` records the
# word in the lease as well as the fleet registry, so send.sh can tell a
# stood-down coordinator from a live one on this host. blocked-on-human is
# written only when ~/.handoffs/<charter>/queue lists no ready item: one
# tab-separated line per item, `<state>\t<theme>\t<item>[\t<note>]`, state
# one of ready, running, gated, parked, done; `#` lines are comments. The file is key=value
# lines in a fixed order. Writes take a lock directory and replace the file by
# rename, so a reader never sees half a lease and two takes never both
# succeed. Tests override COORDINATION_HOME, SOX_BIN and LEASE_NOW.
set -eu

FIELDS="charter watch session shell harness taken_at prior reason released_at handoff state"

usage() {
  sed -n '4,9p' "$0" | sed 's/^# \{0,1\}//' >&2
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

# ready_count: the queue's ready items. Fails on a missing, oversized or
# malformed queue, so blocked-on-human cannot be written past unread work.
ready_count() {
  queue="$dir/queue"
  [ -f "$queue" ] || fail "no queue at $queue: list the charter's items before writing blocked-on-human" 2
  [ "$(wc -c < "$queue")" -le 1048576 ] || fail "queue exceeds 1 MiB: $queue" 2
  awk -F '\t' '
    /^#/ || /^[ \t\r]*$/ { next }
    {
      sub(/\r$/, "")
      if (NF < 3 || $1 !~ /^(ready|running|gated|parked|done)$/) {
        printf "line %d: want <ready|running|gated|parked|done>\\t<theme>\\t<item>\n", NR > "/dev/stderr"
        bad = 1
      } else if ($1 == "ready") ready++
    }
    END { if (bad) exit 2; print ready + 0 }
  ' "$queue" || fail "malformed queue: $queue" 2
}

# Runs on the fleet host; its file lock serializes writers from all charters.
registry_write() (
  fleet=$(cd "$(dirname "$fleet")" && pwd -P)/${fleet##*/}
  [ -f "$fleet" ] && [ ! -L "$fleet" ] || fail "fleet must be a regular file: $fleet" 2
  mkdir "$fleet.lock" 2>/dev/null || fail "$fleet is being written by another process" 5
  tmp="$fleet.tmp.$$"
  trap 'rm -f "$tmp"; rmdir "$fleet.lock"' EXIT
  [ "$(wc -c < "$fleet")" -le 1048576 ] || fail "fleet exceeds 1 MiB: $fleet" 2
  cp -p "$fleet" "$tmp"
  newline=$(tail -c 1 "$fleet" | wc -l)
  awk -v charter="$charter" -v state="$state" -v newline="$newline" '
    /^## / { heading = $0; sub(/\r$/, "", heading); registry = (heading == "## Charters") }
    {
      if (registry && split($0, cells, "|") == 5) {
        name = cells[2]; gsub(/^[ \t]+|[ \t]+$/, "", name)
        if (name == charter) {
          count++
          $0 = cells[1] "|" cells[2] "|" cells[3] "| " state " |" cells[5]
        }
      }
      if (NR > 1) printf "\n"
      printf "%s", $0
    }
    END { if (newline) printf "\n"; if (count != 1) exit 2 }
  ' "$fleet" > "$tmp" || fail "expected exactly one $charter row in $fleet Charters registry" 2
  if cmp -s "$fleet" "$tmp"; then
    printf '%s\t%s\tunchanged\n' "$charter" "$state"
  else
    mv -f "$tmp" "$fleet"
    printf '%s\t%s\tchanged\n' "$charter" "$state"
  fi
)

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

reason="" handoff="" state="" fleet="" fleet_host=""
while [ $# -gt 0 ]; do
  [ $# -ge 2 ] || usage
  case "$1" in
    --reason) reason=$2 ;;
    --handoff) handoff=$2 ;;
    --state) state=$2 ;;
    --fleet) fleet=$2 ;;
    --fleet-host) fleet_host=$2 ;;
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
    write "$charter" $((watch + 1)) "$session" "$shell" "${AI_AGENT:-claude-code}" "$(now)" "$prior" "$reason" "" "" ""
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
      "$(field taken_at)" "$(field prior)" "$(field reason)" "$(now)" "$handoff" "$(field state)"
    ;;

  state)
    case "$state" in live|blocked-on-human|parked) ;; *) fail "State must be live, blocked-on-human, or parked" 2 ;; esac
    case "$fleet" in /*) ;; *) fail "--fleet must be an absolute path on the fleet host" 2 ;; esac
    case "$fleet_host" in *[!A-Za-z0-9._-]*|-*) fail "--fleet-host must be an ssh host alias" 2 ;; esac
    caller
    [ -f "$lease" ] || fail "no lease at $lease" 3
    lock
    [ "$(field session)" = "$session" ] && [ "$(field shell)" = "$shell" ] ||
      fail "only the holder of watch $(field watch) may write State" 4
    if [ "$state" = parked ]; then
      [ -n "$(field released_at)" ] || fail "release the watch before writing parked" 4
    else
      holds || fail "a released watch cannot write $state" 4
    fi
    if [ "$state" = blocked-on-human ]; then
      ready=$(ready_count)
      [ "$ready" -eq 0 ] || fail "$ready ready item(s) in $dir/queue: launch them, or mark each gated with its gate" 6
    fi
    if [ -n "$fleet_host" ]; then
      # Values travel as Bash assignments on stdin, never through ssh quoting.
      { printf 'set -eu\n'; printf 'fleet=%q\ncharter=%q\nstate=%q\n' "$fleet" "$charter" "$state"
        declare -f fail registry_write; printf 'registry_write\n'
      } | ssh -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=2 "$fleet_host" 'bash -s'
    else
      registry_write
    fi
    # After the registry, so a failed registry write changes neither.
    write "$(field charter)" "$(field watch)" "$(field session)" "$(field shell)" "$(field harness)" \
      "$(field taken_at)" "$(field prior)" "$(field reason)" "$(field released_at)" "$(field handoff)" "$state"
    ;;

  *) usage ;;
esac
