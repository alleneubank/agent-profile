#!/usr/bin/env bash
# Lane caps: launch a lane only while its host is under the cap the fleet
# grants it.
#
#   lane.sh slots  --fleet PATH [--fleet-host HOST]
#   lane.sh launch --fleet PATH [--fleet-host HOST] --host H --charter C --lane L --launcher NAME -- ARGV...
#   lane.sh cap    --fleet PATH [--fleet-host HOST] --host H --cap N --why TEXT [--until UTC --after N]
#   lane.sh drift  --fleet PATH [--fleet-host HOST] [--every SECONDS --stop-at UTC]
#
# The caps live in one JSON file on the fleet host (--fleet, an absolute path
# there; --fleet-host reaches it by ssh, as lease.sh state does):
#   {"version":1,"hosts":{"onyx":{"cap":4,"why":"...","set_at":"...",
#     "until":"2026-10-12T16:00:00Z","after":2}}}
# A host key is the name `sox new` takes; the caller's own host (hostname -s)
# is reached as localhost. A host with no entry takes no lanes. While `until`
# has not passed the cap is `cap`, after it `after`.
#
# A lane is a sox shell labeled lane=<name>; every such row on the host counts,
# whatever its status, until the lane is retired. Only launch writes that
# label. Launch holds the fleet lock (<fleet>.lock on the fleet host) from the
# count to the label, so two launches never take the same slot; it checks the
# charter's lease first (lease.sh check).
#
# slots prints one tab-separated line per host: host, lanes, cap, state, load
# per core, and free memory percent. State is free, full, over, closed (cap 0),
# or unknown (sox could not count); load and memory are - when the probe fails.
# launch prints host, backing id, lanes after the launch, and cap.
#
# drift checks the fleet with no agent: every capped host plus this one,
# through sox and an ssh probe (a host key is also its ssh alias). It writes
# ~/.handoffs/fleet-drift.txt, one line per finding (kind, subject, detail,
# first seen, reported or pending), and prints what appeared or cleared:
#   over <host>      more lanes than the cap
#   bypass <host>    an agent shell under ~/Work with no lane, role or attended label
#   load <host>      load per core above LOAD_PER_CORE_MAX, two checks running
#   memory <host>    free memory below FREE_PERCENT_MIN, two checks running
#   blocked <charter> a coordinator labeled state=blocked-on-human
#   unknown <host>   sox or the probe could not reach it (unknown, not dead)
# A newly reported over, load or memory finding goes as evidence (send.sh,
# role fleet-check) to each live coordinator with a lane on that host. A
# bypass has no known owner and a blocked coordinator already shows in sox
# attention, so those are only recorded.
# With --every, drift repeats until --stop-at.
#
# Exit: 0 ok, 2 usage, 3 no lease, 4 caller does not hold the watch, 5 fleet
# lock busy, 6 host has no cap or could not be counted, 7 host at cap,
# 8 the lane already has a shell, 9 sox failed to launch or label.
# Tests override COORDINATION_HOME, SOX_BIN, LANE_NOW, LANE_HOSTNAME and
# LANE_LOCK_WAIT_SECONDS, and LANE_SSH for the probe.
set -eu

CAP_MAX=64
WHY_BYTES_MAX=300
LOCK_WAIT_SECONDS=${LANE_LOCK_WAIT_SECONDS:-60}
LOAD_PER_CORE_MAX=4
FREE_PERCENT_MIN=5
EVERY_SECONDS_MIN=60
EVERY_SECONDS_MAX=3600

usage() {
  sed -n '5,8p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

fail() {
  echo "lane.sh: $1" >&2
  exit "$2"
}

now() {
  if [ -n "${LANE_NOW:-}" ]; then printf '%s\n' "$LANE_NOW"; else date -u +%Y-%m-%dT%H:%M:%SZ; fi
}

# Run sox from /tmp so no directory's .envrc re-points the sox home.
sox_pinned() {
  (cd /tmp && env SOX_HOME="$HOME/.sox" "${SOX_BIN:-sox}" "$@")
}

# sox_name <host>: the name sox reaches a fleet host by from here.
sox_name() {
  if [ "$1" = "${LANE_HOSTNAME:-$(hostname -s)}" ]; then printf 'localhost\n'; else printf '%s\n' "$1"; fi
}

# on_fleet_host <function>: run a function defined here where the fleet file
# lives. Values travel as Bash assignments on stdin, never through ssh quoting.
on_fleet_host() {
  if [ -z "$fleet_host" ]; then
    "$1"
    return
  fi
  { printf 'set -eu\n'
    printf 'fleet=%q\nhost=%q\ncap=%q\nwhy=%q\nuntil=%q\nafter=%q\nset_at=%q\nholder=%q\nLOCK_WAIT_SECONDS=%q\n' \
      "$fleet" "$host" "$cap" "$why" "$until" "$after" "$set_at" "$holder" "$LOCK_WAIT_SECONDS"
    declare -f fail fleet_read fleet_lock fleet_unlock fleet_write_cap
    printf '%s\n' "$1"
  } | ssh -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=2 "$fleet_host" 'bash -s'
}

fleet_read() {
  [ -f "$fleet" ] || fail "no fleet caps file at $fleet" 6
  cat "$fleet"
}

# The lock is a directory naming its holder. A holder that died without
# removing it is reported, not broken: two launches must never share a slot.
fleet_lock() {
  waited=0
  until mkdir "$fleet.lock" 2>/dev/null; do
    if [ "$waited" -ge "$LOCK_WAIT_SECONDS" ]; then
      fail "$fleet.lock held by $(cat "$fleet.lock/holder" 2>/dev/null || echo unknown) for over ${LOCK_WAIT_SECONDS}s; remove it only once that holder is gone" 5
    fi
    sleep 1
    waited=$((waited + 1))
  done
  printf '%s\n' "$holder" > "$fleet.lock/holder"
}

fleet_unlock() {
  rm -f "$fleet.lock/holder"
  rmdir "$fleet.lock"
}

fleet_write_cap() {
  fleet_lock
  tmp="$fleet.tmp.$$"
  trap 'rm -f "$tmp"; fleet_unlock' EXIT
  if [ -f "$fleet" ]; then current=$(cat "$fleet"); else current='{"version":1,"hosts":{}}'; fi
  printf '%s\n' "$current" | jq --arg host "$host" --argjson cap "$cap" --arg why "$why" --arg set_at "$set_at" \
    --arg until "$until" --arg after "$after" '
      .hosts[$host] = ({cap: $cap, why: $why, set_at: $set_at}
        + (if $until == "" then {} else {until: $until, after: ($after | tonumber)} end))
    ' > "$tmp" || fail "$fleet is not a caps file" 2
  mv -f "$tmp" "$fleet"
  jq -c --arg host "$host" '.hosts[$host]' "$fleet"
}

# cap_now <caps json> <host>: the host's cap at this time, empty when none.
cap_now() {
  printf '%s\n' "$1" | jq -r --arg host "$2" --arg now "$(now)" '
    .hosts[$host] // empty
    | if (.until // "") != "" and $now >= .until then .after else .cap end'
}

# host_rows <host>: the host's sox shell rows, one per line, or exit 6 when
# the host did not answer.
host_rows() {
  listing=$(sox_pinned ls "$(sox_name "$1")" --json 2>/dev/null) || fail "sox ls $1 failed" 6
  printf '%s\n' "$listing" | jq -e -s 'map(select(.kind == "summary")) | .[0].complete == true' >/dev/null ||
    fail "sox could not count $1's shells" 6
  printf '%s\n' "$listing" | jq -c 'select(.kind == "shell")'
}

# lane_rows <host>: the host's rows carrying a lane label.
lane_rows() {
  # An explicit exit: callers inside an `if` turn set -e off.
  rows=$(host_rows "$1") || exit
  printf '%s\n' "$rows" | jq -c 'select((.labels.lane // "") != "")'
}

# probe <host>: "cores load free-percent" from the host itself.
probe() {
  # Expands on the probed host.
  # shellcheck disable=SC2016
  snippet='cores=$(getconf _NPROCESSORS_ONLN)
load=$(uptime | sed -E "s/.*load averages?: *([0-9.]+).*/\1/")
if [ -r /proc/meminfo ]; then
  free=$(awk "/^MemTotal:/ {t=\$2} /^MemAvailable:/ {a=\$2} END {printf \"%d\", a * 100 / t}" /proc/meminfo)
else
  free=$(memory_pressure | sed -n -E "s/.*free percentage: *([0-9]+)%.*/\1/p")
fi
echo "$cores $load $free"'
  if [ "$(sox_name "$1")" = localhost ]; then
    bash -c "$snippet"
  else
    "${LANE_SSH:-ssh}" -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=2 "$1" "$snippet"
  fi
}

# findings: this check's raw findings, kind<TAB>subject<TAB>detail, and the
# rows they came from in $rows_all (each tagged with its fleet host).
findings() {
  caps=$(on_fleet_host fleet_read)
  self=${LANE_HOSTNAME:-$(hostname -s)}
  rows_all=""
  for each in $( { printf '%s\n' "$caps" | jq -r '.hosts | keys[]'; printf '%s\n' "$self"; } | sort -u); do
    limit=$(cap_now "$caps" "$each")
    if rows=$(host_rows "$each" 2>/dev/null); then
      rows=$(printf '%s\n' "$rows" | jq -c --arg host "$each" '. + {fleet_host: $host}')
      rows_all="$rows_all$rows
"
      lanes=$(printf '%s\n' "$rows" | jq -c 'select((.labels.lane // "") != "")' | grep -c . || true)
      if [ -n "$limit" ] && [ "$lanes" -gt "$limit" ]; then
        printf 'over\t%s\t%s/%s lanes\n' "$each" "$lanes" "$limit"
      fi
      printf '%s\n' "$rows" | jq -r '
        select(.attention != null and (.cwd // "" | contains("/Work/"))
          and (.labels.lane // .labels.role // .labels.attended // "") == "")
        | "bypass\t\(.fleet_host)\t\(.backing_id) \(.cwd)"'
      printf '%s\n' "$rows" | jq -r '
        select(.labels.role == "coordinator" and .labels.state == "blocked-on-human")
        | "blocked\t\(.labels.charter // "?")\t\(.fleet_host)/\(.backing_id)"'
    else
      printf 'unknown\t%s\tsox could not count its shells\n' "$each"
    fi
    [ -n "$limit" ] || continue
    if measured=$(probe "$each" 2>/dev/null) && [ "$(echo "$measured" | wc -w)" -eq 3 ]; then
      echo "$measured" | awk -v host="$each" -v load_max="$LOAD_PER_CORE_MAX" -v free_min="$FREE_PERCENT_MIN" '
        $2 / $1 > load_max { printf "load\t%s\t%.1f per core\n", host, $2 / $1 }
        $3 < free_min { printf "memory\t%s\t%d%% free\n", host, $3 }'
    else
      printf 'unknown\t%s\tprobe failed\n' "$each"
    fi
  done
}

# notify <host> <finding>: evidence to each live coordinator with a lane there.
notify() {
  charters=$(printf '%s' "$rows_all" | jq -r --arg host "$1" '
    select(.fleet_host == $host and (.labels.lane // "") != "") | .labels.charter // .labels.owner // empty' | sort -u)
  for charter in $charters; do
    printf '%s' "$rows_all" | jq -r --arg charter "$charter" '
      select(.labels.role == "coordinator" and .labels.state == "live" and .labels.charter == $charter)
      | "\(.fleet_host) \(.backing_id)"' |
    while read -r where backing; do
      if [ "$(sox_name "$where")" = localhost ]; then to=$backing; else to="$where/$backing"; fi
      printf 'Fleet drift: %s. lane.sh slots shows every host.' "$2" |
        "$here/send.sh" --charter "$charter" --role fleet-check --to "$to" --kind evidence ||
        echo "lane.sh: evidence to $charter at $to failed" >&2
    done
  done
}

# drift_check: one pass. A load or memory finding is reported on its second
# consecutive check; every other kind on its first.
drift_check() {
  file="${COORDINATION_HOME:-$HOME/.handoffs}/fleet-drift.txt"
  previous=""
  [ -f "$file" ] && previous=$(cat "$file")
  # Run in this shell, not a substitution, so notify sees $rows_all.
  findings > "$file.found.$$"
  tmp="$file.tmp.$$"
  trap 'rm -f "$file.found.$$" "$tmp"' EXIT
  : > "$tmp"
  while IFS="$(printf '\t')" read -r kind subject detail; do
    [ -n "$kind" ] || continue
    before=$(printf '%s\n' "$previous" | awk -F '\t' -v k="$kind" -v s="$subject" '$1 == k && $2 == s' | head -n 1)
    since=$(printf '%s' "$before" | cut -f4)
    [ -n "$since" ] || since=$(now)
    status=reported
    case "$kind" in load|memory) [ -n "$before" ] || status=pending ;; esac
    printf '%s\t%s\t%s\t%s\t%s\n' "$kind" "$subject" "$detail" "$since" "$status" >> "$tmp"
    if [ "$status" = reported ] && [ "$(printf '%s' "$before" | cut -f5)" != reported ]; then
      printf 'new\t%s\t%s\t%s\n' "$kind" "$subject" "$detail"
      case "$kind" in over|load|memory) notify "$subject" "$kind $subject, $detail" ;; esac
    fi
  done < "$file.found.$$"
  printf '%s\n' "$previous" | while IFS="$(printf '\t')" read -r kind subject detail since status; do
    [ -n "$kind" ] && [ "$status" = reported ] || continue
    awk -F '\t' -v k="$kind" -v s="$subject" '$1 == k && $2 == s { found = 1 } END { exit !found }' "$tmp" ||
      printf 'cleared\t%s\t%s\n' "$kind" "$subject"
  done
  mv -f "$tmp" "$file"
  rm -f "$file.found.$$"
}

# state <lanes> <cap>
state() {
  if [ "$2" -eq 0 ]; then echo closed
  elif [ "$1" -lt "$2" ]; then echo free
  elif [ "$1" -eq "$2" ]; then echo full
  else echo over
  fi
}

command -v jq >/dev/null || fail "jq is required" 2
[ $# -ge 1 ] || usage
command=$1
shift
here=$(cd "$(dirname "$0")" && pwd)
fleet="" fleet_host="" host="" charter="" lane="" launcher="" cap="" why="" until="" after="" every="" stop_at=""
while [ $# -gt 0 ]; do
  [ "$1" = -- ] && { shift; break; }
  [ $# -ge 2 ] || usage
  case "$1" in
    --fleet) fleet=$2 ;;
    --fleet-host) fleet_host=$2 ;;
    --host) host=$2 ;;
    --charter) charter=$2 ;;
    --lane) lane=$2 ;;
    --launcher) launcher=$2 ;;
    --cap) cap=$2 ;;
    --why) why=$2 ;;
    --until) until=$2 ;;
    --after) after=$2 ;;
    --every) every=$2 ;;
    --stop-at) stop_at=$2 ;;
    *) usage ;;
  esac
  shift 2
done
case "$fleet" in /*) ;; *) fail "--fleet must be an absolute path on the fleet host" 2 ;; esac
case "$fleet_host" in *[!A-Za-z0-9._-]*|-*) fail "--fleet-host must be an ssh host alias" 2 ;; esac
for name in "$host" "$charter" "$lane" "$launcher"; do
  case "$name" in *[!A-Za-z0-9._-]*|-*) fail "host, charter, lane and launcher must be plain names like onyx" 2 ;; esac
done
set_at=$(now)
holder="$(hostname -s) pid $$ $set_at"

case "$command" in
  slots)
    [ $# -eq 0 ] || usage
    caps=$(on_fleet_host fleet_read)
    for each in $(printf '%s\n' "$caps" | jq -r '.hosts | keys[]'); do
      limit=$(cap_now "$caps" "$each")
      if rows=$(lane_rows "$each" 2>/dev/null); then
        lanes=$(printf '%s' "$rows" | grep -c . || true)
        counted="$lanes\t$limit\t$(state "$lanes" "$limit")"
      else
        counted="-\t$limit\tunknown"
      fi
      if measured=$(probe "$each" 2>/dev/null) && [ "$(echo "$measured" | wc -w)" -eq 3 ]; then
        headroom=$(echo "$measured" | awk '{ printf "%.1f\t%d", $2 / $1, $3 }')
      else
        headroom="-\t-"
      fi
      printf '%s\t%b\t%b\n' "$each" "$counted" "$headroom"
    done
    ;;

  launch)
    [ -n "$host" ] && [ -n "$charter" ] && [ -n "$lane" ] && [ -n "$launcher" ] && [ $# -ge 1 ] || usage
    "$here/lease.sh" check "$charter"
    on_fleet_host fleet_lock
    trap 'on_fleet_host fleet_unlock' EXIT
    limit=$(cap_now "$(on_fleet_host fleet_read)" "$host")
    [ -n "$limit" ] || fail "$host has no cap in $fleet: it takes no lanes until lane.sh cap sets one" 6
    rows=$(lane_rows "$host")
    lanes=$(printf '%s' "$rows" | grep -c . || true)
    existing=$(printf '%s' "$rows" | jq -r --arg lane "$lane" 'select(.labels.lane == $lane) | .backing_id')
    [ -z "$existing" ] || fail "lane $lane already has a shell on $host: $existing" 8
    [ "$lanes" -lt "$limit" ] || fail "$host $lanes/$limit $(state "$lanes" "$limit"): queue the lane" 7
    target=$(sox_pinned new "$(sox_name "$host")" --no-attach --exec -- "$@") || fail "sox new $host failed" 9
    backing=${target#*/}
    if ! sox_pinned label "$target" owner="$charter" charter="$charter" lane="$lane" launcher="$launcher" >/dev/null; then
      # An unlabeled lane escapes the count, so it does not get to run.
      sox_pinned kill "$target" >/dev/null 2>&1 || fail "labeling $target failed and so did killing it: kill it by hand" 9
      fail "labeling $target failed; the shell was killed" 9
    fi
    printf '%s\t%s\t%s\t%s\n' "$host" "$backing" $((lanes + 1)) "$limit"
    ;;

  cap)
    [ $# -eq 0 ] && [ -n "$host" ] && [ -n "$cap" ] && [ -n "$why" ] || usage
    case "$cap" in ''|*[!0-9]*) fail "--cap must be a whole number" 2 ;; esac
    [ "$cap" -le "$CAP_MAX" ] || fail "--cap exceeds $CAP_MAX" 2
    case "$why" in *"
"*) fail "--why must be one line" 2 ;; esac
    [ "$(printf '%s' "$why" | wc -c)" -le "$WHY_BYTES_MAX" ] || fail "--why exceeds $WHY_BYTES_MAX bytes" 2
    if [ -n "$until$after" ]; then
      printf '%s\n' "$until" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' ||
        fail "--until must be UTC like 2026-10-12T16:00:00Z" 2
      case "$after" in ''|*[!0-9]*) fail "--until needs --after, the cap once it passes" 2 ;; esac
      [ "$after" -le "$CAP_MAX" ] || fail "--after exceeds $CAP_MAX" 2
    fi
    on_fleet_host fleet_write_cap
    ;;

  drift)
    [ $# -eq 0 ] || usage
    if [ -z "$every$stop_at" ]; then
      drift_check
      exit 0
    fi
    case "$every" in ''|*[!0-9]*) fail "--every must be whole seconds" 2 ;; esac
    [ "$every" -ge "$EVERY_SECONDS_MIN" ] && [ "$every" -le "$EVERY_SECONDS_MAX" ] ||
      fail "--every must be $EVERY_SECONDS_MIN to $EVERY_SECONDS_MAX seconds" 2
    printf '%s\n' "$stop_at" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' ||
      fail "--every needs --stop-at, a UTC time like 2026-10-12T16:00:00Z" 2
    # Bounded by --stop-at: the fan-out's end, not a daemon.
    while [ "$(now)" \< "$stop_at" ]; do
      drift_check
      sleep "$every"
    done
    ;;

  *) usage ;;
esac
