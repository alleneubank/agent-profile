#!/usr/bin/env bash
# Lane caps: launch a lane only while its host is under the cap the fleet
# grants it.
#
#   lane.sh slots  --fleet PATH [--fleet-host HOST]
#   lane.sh launch --fleet PATH [--fleet-host HOST] --host H --charter C --lane L --launcher NAME
#                  --pretrust none|CONFIG_DIR [--workdir DIR] -- ARGV...
#   lane.sh cap    --fleet PATH [--fleet-host HOST] --host H --cap N --why TEXT [--until UTC --after N]
#   lane.sh reserve --fleet PATH [--fleet-host HOST] --resource R --owners C[,C...] --until UTC --why TEXT
#   lane.sh release --fleet PATH [--fleet-host HOST] --resource R
#   lane.sh reservations --fleet PATH [--fleet-host HOST]
#   lane.sh drift  --fleet PATH [--fleet-host HOST] [--every SECONDS --stop-at UTC]
#
# The caps and reservations live in one JSON file on the fleet host (--fleet,
# an absolute path there; --fleet-host reaches it by ssh):
#   {"version":1,"hosts":{"onyx":{"cap":4,"why":"...","set_at":"...",
#     "until":"2026-10-12T16:00:00Z","after":2}},
#    "reservations":{"pixelproton":{"owners":["sox-lanes"],"why":"...",
#     "set_at":"...","until":"2026-10-12T20:00:00Z"}}}
# A host key is the name `sox new` takes; the caller's own host (hostname -s)
# is reached as localhost. A host with no entry takes no lanes. While `until`
# has not passed the cap is `cap`, after it `after`.
#
# A reservation gives a resource (a host key, a device id, an account) to its
# owner charters until `until`, at most RESERVATION_HOURS_MAX ahead. While it
# holds, launch refuses a lane on a reserved host to any other charter (exit
# 12, naming the reservation); the owners' launches still take the cap's
# slots. Lanes already running are not touched. lane.sh can only enforce a
# host: a device or account reservation is a record every coordinator reads
# with `reservations` before using that resource. A reservation past its
# `until` holds nothing; reserve and release drop such entries and print
# what they dropped (pruned), and release prints the entry it removed. An
# entry missing a field holds its resource against every charter until
# replaced (exit 12 names it). A file with no reservations key has none.
#
# A lane is a sox shell labeled lane=<name>; every such row on the host counts,
# whatever its status, until the lane is retired. Only launch writes that
# label. Launch holds the fleet lock (<fleet>.lock on the fleet host) from the
# count to the label, so two launches never take the same slot; it checks the
# charter's lease first (lease.sh check).
#
# slots prints one tab-separated line per host: host, lanes, cap, state, load
# per core, free memory percent, the reservation's owners (comma-separated)
# and its until. State is free, full, over, closed (cap 0), or unknown (sox
# could not count); load and memory are - when the probe fails, and the last
# two are - when no reservation holds the host. reservations prints one line
# per holding reservation: resource, owners, until, why, set_at.
# launch prints host, backing id, lanes after the launch, and cap.
#
# Before it takes a slot, launch answers a Claude Code agent's startup dialogs
# on the lane host: `claude-pretrust --fix --config-dir CONFIG_DIR DIR`, where
# DIR is where ARGV starts the agent and CONFIG_DIR the launcher account's
# Claude config directory (. for ~/.claude.json, .claude-send for the Send
# account). Both are paths on the lane host, absolute or relative to its home,
# so a ~ the caller's shell expands never names the wrong host's home. Every
# launch must state --pretrust (none for another harness, which needs no
# --workdir), so no launch skips it silently. A directory pretrust refuses
# (exit 10) is the human's to answer.
#
# drift checks the fleet with no agent: every capped host plus this one,
# through sox and an ssh probe (a host key is also its ssh alias). It writes
# ~/.handoffs/fleet-drift.txt, one line per finding (kind, subject, detail,
# first seen, reported or pending), and prints what appeared or cleared:
#   over <host>      more lanes than the cap
#   bypass <host>    an agent shell under ~/Work with no lane, role or attended label
#   load <host>      load per core above LOAD_PER_CORE_MAX, two checks running
#   memory <host>    free memory below FREE_PERCENT_MIN, two checks running
#   blocked <charter> a coordinator on this host whose lease says blocked-on-human
#   unknown <host>   sox or the probe could not reach it (unknown, not dead)
# A newly reported over, load or memory finding goes as evidence (send.sh,
# role fleet-check) to each coordinator with a lane on that host; send.sh
# leaves a stood-down one alone. A
# bypass has no known owner and a blocked coordinator already shows in sox
# attention, so those are only recorded.
# With --every, drift repeats until --stop-at.
#
# Exit: 0 ok, 2 usage, 3 no lease, 4 caller does not hold the watch, 5 fleet
# lock busy, 6 host has no cap or could not be counted, 7 host at cap,
# 8 the lane already has a shell, 9 sox failed to launch or label,
# 10 claude-pretrust refused the directory (the human answers its dialogs),
# 11 claude-pretrust failed or could not run, 12 the host is reserved for
# another charter.
# Tests override COORDINATION_HOME, SOX_BIN, LANE_NOW, LANE_HOSTNAME and
# LANE_LOCK_WAIT_SECONDS, and LANE_SSH for the probe and pretrust.
set -eu

CAP_MAX=64
WHY_BYTES_MAX=300
LOCK_WAIT_SECONDS=${LANE_LOCK_WAIT_SECONDS:-60}
LOAD_PER_CORE_MAX=4
FREE_PERCENT_MIN=5
EVERY_SECONDS_MIN=60
EVERY_SECONDS_MAX=3600
RESERVATION_HOURS_MAX=168
OWNERS_MAX=8
# The one definition of a reservation entry, shared by every reader and
# writer. An entry that does not fit it is malformed: it holds its resource
# against every charter until reserve or release replaces it, so a hand edit
# can never open a reserved host, and no write prunes it.
# shellcheck disable=SC2016
RESERVATION_JQ='
def well_formed: type == "object"
  and (.owners | type) == "array" and (.owners | length) > 0 and all(.owners[]; type == "string")
  and (.until | type) == "string" and (.until | test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$"))
  and (.why | type) == "string" and (.set_at | type) == "string";
def entries: (.reservations // {})
  | if type == "object" then to_entries | sort_by(.key) else error("reservations is not an object") end;
def lapsed($now): (.value | well_formed) and $now >= .value.until;
def pruned: ((.[0].reservations // {}) | keys) - ((.[1].reservations // {}) | keys) - [$resource];
'

usage() {
  sed -n '5,12p' "$0" | sed 's/^# \{0,1\}//' >&2
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
    printf 'resource=%q\nowners=%q\nedit=%q\nreport=%q\n' "$resource" "$owners" "$edit" "$report"
    declare -f fail fleet_read fleet_lock fleet_unlock fleet_update
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

# fleet_update: apply the jq program $edit to the fleet file under the lock,
# then print $report evaluated on [before, after].
fleet_update() {
  fleet_lock
  tmp="$fleet.tmp.$$"
  trap 'rm -f "$tmp"; fleet_unlock' EXIT
  if [ -f "$fleet" ]; then current=$(cat "$fleet"); else current='{"version":1,"hosts":{}}'; fi
  printf '%s\n' "$current" | jq --arg host "$host" --arg cap "$cap" --arg why "$why" --arg set_at "$set_at" \
    --arg until "$until" --arg after "$after" --arg resource "$resource" --arg owners "$owners" \
    "$edit" > "$tmp" || fail "$fleet is not a caps file" 2
  mv -f "$tmp" "$fleet"
  printf '%s\n' "$current" | jq -c -s --arg host "$host" --arg resource "$resource" "$report" - "$fleet"
}

# cap_now <caps json> <host>: the host's cap at this time, empty when none.
cap_now() {
  printf '%s\n' "$1" | jq -r --arg host "$2" --arg now "$(now)" '
    .hosts[$host] // empty
    | if (.until // "") != "" and $now >= .until then .after else .cap end'
}

# holding <fleet json>: the reservations that hold now, as resource<TAB>
# owners<TAB>until<TAB>why<TAB>set_at lines. A malformed entry holds with
# owners -, which no charter name can be, and until "malformed".
holding() {
  printf '%s\n' "$1" | jq -r --arg now "$(now)" "$RESERVATION_JQ"'
    entries[] | select(lapsed($now) | not)
    | if .value | well_formed then [.key, (.value.owners | join(",")), .value.until, .value.why, .value.set_at]
      else [.key, "-", "malformed", "not {owners, why, set_at, until}; replace it with lane.sh reserve or release", "-"] end
    | @tsv'
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
  on_lane_host "$1" "$snippet"
}

# on_lane_host <host> <command>: run a shell command from the host's home.
on_lane_host() {
  if [ "$(sox_name "$1")" = localhost ]; then
    (cd "$HOME" && bash -c "$2")
  else
    "${LANE_SSH:-ssh}" -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=2 "$1" "$2"
  fi
}

# answer_dialogs <host>: answer the agent's startup dialogs for $workdir under
# $pretrust's account, or exit 10 when the grant leaves them to the human.
answer_dialogs() {
  [ "$pretrust" != none ] || return 0
  # Both paths passed the plain-path check, so the command needs no quoting.
  pretrust_exit=0
  answer=$(on_lane_host "$1" "claude-pretrust --fix --config-dir $pretrust $workdir" 2>&1) || pretrust_exit=$?
  [ -z "$answer" ] || printf '%s\n' "$answer" >&2
  case "$pretrust_exit" in
    0) ;;
    3) fail "claude-pretrust refused $workdir on $1: the human answers its startup dialogs, then launch again" 10 ;;
    *) fail "claude-pretrust on $1 exited $pretrust_exit" 11 ;;
  esac
}

# blocked_coordinators <host> <rows>: a blocked finding for each coordinator
# shell on this host whose held lease says blocked-on-human. The lease is the
# only record of a charter's state; lease.sh labels the shell it names with
# lease.<charter>=<lease path>. Leases are files on this host, so a
# coordinator on another host is not read.
blocked_coordinators() {
  printf '%s\n' "$2" | jq -r 'select(.labels.role == "coordinator") | .backing_id' |
  while read -r backing; do
    if ! labels=$(sox_pinned label "$backing" 2>/dev/null); then
      printf 'unknown\t%s/%s\tsox could not read its labels\n' "$1" "$backing"
      continue
    fi
    # sox label values hold no whitespace, so each line is one whole path.
    printf '%s\n' "$labels" | awk 'index($0, "lease.") == 1 { sub(/^[^=]*=/, ""); print }' |
    while read -r lease; do
      [ -f "$lease" ] && grep -qxF "shell=$backing" "$lease" || continue
      [ -z "$(sed -n 's/^released_at=//p' "$lease" | head -n 1)" ] || continue
      [ "$(sed -n 's/^state=//p' "$lease" | head -n 1)" = blocked-on-human ] || continue
      printf 'blocked\t%s\t%s/%s\n' "$(sed -n 's/^charter=//p' "$lease" | head -n 1)" "$1" "$backing"
    done
  done
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
      [ "$(sox_name "$each")" != localhost ] || blocked_coordinators "$each" "$rows"
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

# notify <host> <finding>: evidence to each coordinator with a lane there. A
# session that coordinates several charters carries one charter label and a
# lease label for each.
# send.sh refuses a stood-down coordinator from its lease (exit 5), which is
# the intended outcome and is not reported.
notify() {
  charters=$(printf '%s' "$rows_all" | jq -r --arg host "$1" '
    select(.fleet_host == $host and (.labels.lane // "") != "") | .labels.charter // .labels.owner // empty' | sort -u)
  for charter in $charters; do
    printf '%s' "$rows_all" | jq -r --arg charter "$charter" '
      select(.labels.role == "coordinator"
        and (.labels.charter == $charter or .labels["lease." + $charter] != null))
      | "\(.fleet_host) \(.backing_id)"' |
    while read -r where backing; do
      if [ "$(sox_name "$where")" = localhost ]; then to=$backing; else to="$where/$backing"; fi
      sent=0
      refusal=$(printf 'Fleet drift: %s. lane.sh slots shows every host.' "$2" |
        "$here/send.sh" --charter "$charter" --role fleet-check --to "$to" --kind evidence 2>&1 >/dev/null) || sent=$?
      case "$sent" in
        0|5) ;;
        *) echo "lane.sh: evidence to $charter at $to failed (send.sh exit $sent): $refusal" >&2 ;;
      esac
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

# check_why: --why is the human's word, one line and bounded.
check_why() {
  case "$why" in *"
"*) fail "--why must be one line" 2 ;; esac
  [ "$(printf '%s' "$why" | wc -c)" -le "$WHY_BYTES_MAX" ] || fail "--why exceeds $WHY_BYTES_MAX bytes" 2
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
fleet="" fleet_host="" host="" charter="" lane="" launcher="" workdir="" pretrust="" cap="" why="" resource="" owners="" edit="" report="" until="" after="" every="" stop_at=""
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
    --workdir) workdir=$2 ;;
    --pretrust) pretrust=$2 ;;
    --cap) cap=$2 ;;
    --why) why=$2 ;;
    --until) until=$2 ;;
    --after) after=$2 ;;
    --every) every=$2 ;;
    --stop-at) stop_at=$2 ;;
    --resource) resource=$2 ;;
    --owners) owners=$2 ;;
    *) usage ;;
  esac
  shift 2
done
case "$fleet" in /*) ;; *) fail "--fleet must be an absolute path on the fleet host" 2 ;; esac
case "$fleet_host" in *[!A-Za-z0-9._-]*|-*) fail "--fleet-host must be an ssh host alias" 2 ;; esac
for name in "$host" "$charter" "$lane" "$launcher"; do
  case "$name" in *[!A-Za-z0-9._-]*|-*) fail "host, charter, lane and launcher must be plain names like onyx" 2 ;; esac
done
case "$resource" in *[!A-Za-z0-9._@-]*|-*) fail "--resource must be a plain name like pixelproton" 2 ;; esac
case "$owners" in *[!A-Za-z0-9._,-]*|-*|,*|*,|*,,*) fail "--owners must be charter names separated by commas" 2 ;; esac
for path in "$workdir" "$pretrust"; do
  case "$path" in *[!A-Za-z0-9._/-]*|-*) fail "--workdir and --pretrust must be plain paths like Work/repo.worktrees/lane" 2 ;; esac
done
set_at=$(now)
holder="$(hostname -s) pid $$ $set_at"

# The jq programs in $edit and $report bind their $names as jq arguments.
# shellcheck disable=SC2016
case "$command" in
  slots)
    [ $# -eq 0 ] || usage
    caps=$(on_fleet_host fleet_read)
    held=$(holding "$caps") || fail "$fleet has unreadable reservations" 2
    for each in $(printf '%s\n' "$caps" | jq -r '.hosts | keys[]'); do
      limit=$(cap_now "$caps" "$each")
      reserved=$(printf '%s\n' "$held" | awk -F '\t' -v host="$each" '$1 == host { print $2 "\t" $3 }')
      [ -n "$reserved" ] || reserved="-\t-"
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
      printf '%s\t%b\t%b\t%b\n' "$each" "$counted" "$headroom" "$reserved"
    done
    ;;

  launch)
    [ -n "$host" ] && [ -n "$charter" ] && [ -n "$lane" ] && [ -n "$launcher" ] && [ -n "$pretrust" ] &&
      [ $# -ge 1 ] || usage
    [ "$pretrust" = none ] || [ -n "$workdir" ] || fail "--pretrust $pretrust needs --workdir, where the agent starts" 2
    "$here/lease.sh" check "$charter"
    # Before the lock: its answers are idempotent and harmless if the host
    # then refuses, and a slow ssh must not hold every other launch.
    answer_dialogs "$host"
    on_fleet_host fleet_lock
    trap 'on_fleet_host fleet_unlock' EXIT
    # A caps file that cannot be read (its error already printed) grants no
    # cap, so the launch is refused below as a host with no cap.
    caps=$(on_fleet_host fleet_read) || caps=""
    # Unreadable reservations refuse every launch: the guard never fails open.
    held=$(holding "$caps") || fail "$fleet has unreadable reservations, so no launch passes them: fix the file" 12
    refusal=$(printf '%s\n' "$held" | awk -F '\t' -v host="$host" -v charter="$charter" -v fleet="$fleet" '
      $1 == host && $3 == "malformed" {
        printf "%s has a malformed reservation in %s (%s): queue the lane", host, fleet, $4
      }
      $1 == host && $3 != "malformed" && index("," $2 ",", "," charter ",") == 0 {
        printf "%s is reserved for %s until %s (reservation in %s: %s; set %s): queue the lane", host, $2, $3, fleet, $4, $5
      }')
    [ -z "$refusal" ] || fail "$refusal" 12
    limit=$(cap_now "$caps" "$host")
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
    check_why
    if [ -n "$until$after" ]; then
      printf '%s\n' "$until" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' ||
        fail "--until must be UTC like 2026-10-12T16:00:00Z" 2
      case "$after" in ''|*[!0-9]*) fail "--until needs --after, the cap once it passes" 2 ;; esac
      [ "$after" -le "$CAP_MAX" ] || fail "--after exceeds $CAP_MAX" 2
    fi
    edit='.hosts[$host] = ({cap: ($cap | tonumber), why: $why, set_at: $set_at}
      + (if $until == "" then {} else {until: $until, after: ($after | tonumber)} end))'
    report='.[1].hosts[$host]'
    on_fleet_host fleet_update
    ;;

  reserve)
    [ $# -eq 0 ] && [ -n "$resource" ] && [ -n "$owners" ] && [ -n "$until" ] && [ -n "$why" ] || usage
    check_why
    printf '%s\n' "$until" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' ||
      fail "--until must be UTC like 2026-10-12T16:00:00Z" 2
    ahead=$(jq -n --arg until "$until" --arg now "$set_at" '($until | fromdateiso8601) - ($now | fromdateiso8601)' 2>/dev/null) ||
      fail "--until must be a real UTC time like 2026-10-12T16:00:00Z" 2
    [ "$ahead" -gt 0 ] && [ "$ahead" -le $((RESERVATION_HOURS_MAX * 3600)) ] ||
      fail "--until must be after now and at most ${RESERVATION_HOURS_MAX}h ahead" 2
    count=$(printf '%s\n' "$owners" | tr ',' '\n' | grep -c .)
    [ "$count" -ge 1 ] && [ "$count" -le "$OWNERS_MAX" ] || fail "--owners names 1 to $OWNERS_MAX charters" 2
    edit="$RESERVATION_JQ"'.reservations = (entries | map(select(lapsed($set_at) | not)) | from_entries
      | .[$resource] = {owners: ($owners | split(",")), why: $why, set_at: $set_at, until: $until})'
    report="$RESERVATION_JQ"'{reserved: $resource, entry: .[1].reservations[$resource], pruned: pruned}'
    on_fleet_host fleet_update
    ;;

  release)
    [ $# -eq 0 ] && [ -n "$resource" ] || usage
    edit="$RESERVATION_JQ"'if has("reservations")
      then .reservations = (entries | map(select(.key != $resource and (lapsed($set_at) | not))) | from_entries)
      else . end'
    report="$RESERVATION_JQ"'{released: $resource, was: .[0].reservations[$resource], pruned: pruned}'
    on_fleet_host fleet_update
    ;;

  reservations)
    [ $# -eq 0 ] || usage
    holding "$(on_fleet_host fleet_read)" || fail "$fleet has unreadable reservations" 2
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
