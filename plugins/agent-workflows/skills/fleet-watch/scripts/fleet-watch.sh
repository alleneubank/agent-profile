#!/usr/bin/env bash
# The fleet watch's own commands, run from its sox shell on the control host.
#
#   fleet-watch.sh take       --reason TEXT
#   fleet-watch.sh exceptions --fleet PATH --state DIR [--every SECONDS]
#   fleet-watch.sh pass       --fleet PATH
#   fleet-watch.sh watch
#
# take       takes the fleet-watch lease (lease.sh take) and labels this shell
#            role=fleet-watch charter=fleet-watch. The lease it prints names the
#            predecessor's session and shell in prior=; retiring that shell is
#            the caller's act, by that id.
# exceptions checks the fleet every SECONDS (default 600) and prints one line
#            when a condition starts and one CLEARED line when it ends:
#              COORDINATOR GONE / LIMIT-STOPPED  a live lease on this host whose
#                shell is gone or stopped on a usage limit; leases are read under
#                ~/.handoffs and every coordination home the charter registry
#                (fleet.md beside the caps file) names on this host;
#              QUOTA     an account's weekly window at >= 90% or >= 97%;
#              DISK      a caps-file host under 15% free on its home volume;
#              HOST UNREACHABLE  a caps-file host failing plain ssh for 15+ min.
#            It exits 0 after a pass that printed. DIR keeps what was reported,
#            so a restart with the same DIR stays quiet until something changes.
# pass       prints one snapshot: the lease check, lane slots per host, each
#            coordinator shell with its attention and transcript age, and load
#            and disk per capped host.
# watch      streams every shell and host on every daemon and prints one line per
#            attention event: BLOCKED and ERROR from a coordinator, ANSWERED when
#            a coordinator leaves blocked, STUCK >10m for a lane blocked that
#            long, UNSTUCK when it moves on, GONE MID-WORK for a shell that
#            exited while working or blocked, and HOST lines for a host
#            unreachable past 60 s and its recovery. Its own shell is excluded.
#            Raw events go to $FLEET_WATCH_DIR/raw.log (~/Work/fleet-watch),
#            rotated at 50 MB.
#
# Exit: 0 ok, 2 usage, otherwise the failing lease.sh, sox, or lane.sh code.
# Needs bash 3.2+, jq, perl, timeout, agent-quota (exceptions), and the
# coordinator skill's scripts beside this skill. Tests override
# COORDINATION_HOME, SOX_BIN, and FLEET_WATCH_DIR.
set -euo pipefail

CHARTER="fleet-watch"
RAW_LOG_BYTES_MAX=50000000
HOST_GRACE_S=60
STUCK_S=600
EXCEPTIONS_EVERY_S=600
QUOTA_THRESHOLDS="97 90"
HOST_DOWN_S=900
DISK_FREE_PERCENT_MIN=15

usage() {
  sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

fail() {
  printf 'fleet-watch.sh: %s\n' "$1" >&2
  exit "${2:-1}"
}

# Resolve through symlinks so a link on PATH still finds the sibling skill.
self=$0
while [ -L "$self" ]; do
  link=$(readlink "$self")
  case "$link" in /*) self=$link ;; *) self=$(dirname "$self")/$link ;; esac
done
COORDINATOR_SCRIPTS=$(cd "$(dirname "$self")/../../coordinator/scripts" && pwd -P) ||
  fail "coordinator scripts not found beside this skill" 2

sox_cmd() {
  (cd /tmp && env SOX_HOME="$HOME/.sox" "${SOX_BIN:-sox}" "$@")
}

own_shell() {
  local shell
  shell=$(sox_cmd which $$) || fail "sox which could not name this process's shell: run the fleet watch in a sox shell" 2
  [ -n "$shell" ] || fail "sox which named no shell" 2
  printf '%s\n' "$shell"
}

take() {
  [ $# -eq 2 ] && [ "$1" = --reason ] || usage
  local shell
  shell=$(own_shell)
  "$COORDINATOR_SCRIPTS/lease.sh" take "$CHARTER" --reason "$2"
  sox_cmd label "$shell" role=fleet-watch charter=fleet-watch
}

watch() {
  [ $# -eq 0 ] || usage
  local shell dir
  shell=$(own_shell)
  dir=${FLEET_WATCH_DIR:-$HOME/Work/fleet-watch}
  mkdir -p "$dir"
  if [ -f "$dir/raw.log" ] && [ "$(wc -c < "$dir/raw.log")" -gt "$RAW_LOG_BYTES_MAX" ]; then
    mv -f "$dir/raw.log" "$dir/raw.log.1"
  fi
  sox_cmd watch --all --json 2>&1 |
    perl -MPOSIX -ne '
      BEGIN { $| = 1; open(RAW, ">>", $ARGV[0]) or die "raw log: $!"; shift @ARGV; select(RAW); $| = 1; select(STDOUT) }
      print RAW strftime("%H:%M:%S ", localtime), $_;
      print if /^\{/' "$dir/raw.log" |
    jq --unbuffered -c --arg self "$shell" '
      if .kind == "host" then {k: "host", h: .host, s: .status, r: (.reason // "")}
      elif .target == $self then empty
      else {k: "att", t: .target, s: .state, p: (.previous // ""), lane: (.labels.lane // null),
            c: (.labels.charter // "-"), r: ((.reason // "") | gsub("\n"; " ") | .[0:160])} end' |
    perl -MJSON::PP -e '
      my ($host_grace, $stuck) = @ARGV; @ARGV = ();
      $| = 1;
      my (%down, %why, %told, %blocked_since, %blocked_line, %stuck_told);
      sub attention {
        my $e = shift; my ($t, $s, $p) = ($e->{t}, $e->{s}, $e->{p});
        my $is_lane = defined $e->{lane};
        if ($s eq "blocked" || $s eq "error") {
          my $line = uc($s) . " $t [$e->{c}" . ($is_lane ? "/$e->{lane}" : "") . "] $e->{r}";
          if (!$is_lane || $s eq "error") { print "$line\n" if $s ne $p; return }
          $blocked_since{$t} //= time; $blocked_line{$t} = $line; return;
        }
        print "ANSWERED $t [$e->{c}] now=$s\n" if !$is_lane && $p eq "blocked";
        print "UNSTUCK $t now=$s after " . (time - $blocked_since{$t}) . "s\n" if $stuck_told{$t};
        delete $blocked_since{$t}; delete $stuck_told{$t}; delete $blocked_line{$t};
        print "GONE MID-WORK $t [$e->{c}/" . ($e->{lane} // "-") . "] prev=$p\n"
          if $s eq "gone" && ($p eq "working" || $p eq "blocked");
      }
      sub host {
        my $e = shift; my $h = $e->{h};
        if ($e->{s} eq "connected") {
          print "HOST $h recovered after " . (time - $down{$h}) . "s\n" if $told{$h};
          delete $down{$h}; delete $told{$h};
        } else { $down{$h} //= time; $why{$h} = $e->{r} }
      }
      my $buffer = ""; my $readable = ""; vec($readable, fileno(STDIN), 1) = 1;
      while (1) {
        if (select(my $ready = $readable, undef, undef, 5) > 0) {
          my $got = sysread(STDIN, $buffer, 65536, length $buffer);
          last unless $got;
          while ($buffer =~ s/^([^\n]*)\n//) {
            my $e = eval { decode_json($1) } or next;
            if ($e->{k} eq "att") { attention($e) } else { host($e) }
          }
        }
        for my $h (keys %down) {
          next if $told{$h} || time - $down{$h} <= $host_grace;
          print "HOST $h unreachable for >${host_grace}s: $why{$h}\n"; $told{$h} = 1;
        }
        for my $t (keys %blocked_since) {
          next if $stuck_told{$t} || time - $blocked_since{$t} <= $stuck;
          print "STUCK >" . ($stuck / 60) . "m $blocked_line{$t}\n"; $stuck_told{$t} = 1;
        }
      }' "$HOST_GRACE_S" "$STUCK_S"
}

# minutes_since <path>: whole minutes since the file last changed.
minutes_since() {
  local changed
  changed=$(stat -f %m "$1" 2>/dev/null || stat -c %Y "$1")
  printf '%sm' $(( ($(date +%s) - changed) / 60 ))
}

transcript() {
  local dir file
  for dir in "$HOME/.claude/projects" "$HOME/.claude-send/projects"; do
    for file in "$dir"/*/"$1".jsonl; do
      [ -f "$file" ] && { printf '%s\n' "$file"; return 0; }
    done
  done
  return 1
}

# Runs on the probed host, locally or as a function sent over ssh.
load_and_disk() {
  printf 'load %s disk %s\n' "$(uptime | sed -E 's/.*load averages?: *//')" "$(df -h ~ | tail -1 | awk '{print $5}')"
}

# Runs on the probed host. The home volume, not /: on macOS / is the sealed
# system volume and always reads nearly empty.
disk_used_percent() {
  df -P ~ | awk 'NR == 2 { sub("%", "", $5); print $5 }'
}

# on_host <host> <function>: runs one of this script's functions on the host,
# here when the host is this machine and over plain ssh otherwise, and prints
# its last output line. On an ssh failure it prints ssh's last line and fails.
on_host() {
  local out
  if [ "$1" = "$(hostname -s)" ] || [ "$1" = localhost ]; then
    "$2"
  elif out=$({ declare -f "$2"; echo "$2"; } |
      ssh -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=2 "$1" 'bash -s' 2>&1); then
    printf '%s\n' "${out##*$'\n'}"
  else
    printf '%s\n' "${out##*$'\n'}"
    return 1
  fi
}

pass() {
  [ $# -eq 2 ] && [ "$1" = --fleet ] || usage
  local fleet=$2 status=0 shell charter attention session file age host probe
  case "$fleet" in /*) ;; *) fail "--fleet must be an absolute path" 2 ;; esac
  date -u +%Y-%m-%dT%H:%MZ
  "$COORDINATOR_SCRIPTS/lease.sh" check "$CHARTER" || status=$?
  echo "lease=$status"
  echo "--- slots"
  "$COORDINATOR_SCRIPTS/lane.sh" slots --fleet "$fleet" || echo "slots failed: exit $?"
  echo "--- coordinators"
  sox_cmd ls --json |
    jq -r 'select(.kind == "shell" and .host == "localhost" and (.labels.role // "") == "coordinator")
      | [.backing_id, (.labels.charter // "-"), (.attention // "-"), (.native_session // "")] | @tsv' |
    while IFS=$'\t' read -r shell charter attention session; do
      age=no-transcript
      if [ -n "$session" ] && file=$(transcript "$session"); then age=$(minutes_since "$file"); fi
      printf '%s\t%s\t%s\t%s\n' "$shell" "$charter" "$attention" "$age"
    done
  echo "--- hosts"
  for host in $(jq -r '.hosts | keys[]' "$fleet"); do
    if probe=$(on_host "$host" load_and_disk); then
      printf '%s: %s\n' "$host" "$probe"
    else
      printf '%s: unreachable: %s\n' "$host" "$probe"
    fi
  done
}

# The exception monitor keeps one file per reported condition in its state
# directory, named by the condition's key and holding the line it printed, so
# each condition prints once when it starts and once when it clears, across
# restarts. .printed marks a pass that printed; .down-since-<host> holds when a
# host's ssh probe first failed.
report() { # <key> <line>
  [ -e "$state_dir/$1" ] && return 0
  printf '%s\n' "$2" > "$state_dir/$1"
  printf '%s %s\n' "$(date -u +%H:%MZ)" "$2"
  : > "$state_dir/.printed"
}

resolve() { # <key>
  [ -e "$state_dir/$1" ] || return 0
  printf '%s CLEARED %s\n' "$(date -u +%H:%MZ)" "$(cat "$state_dir/$1")"
  rm "$state_dir/$1"
  : > "$state_dir/.printed"
}

# coordination_homes <registry>: the default coordination home and the home of
# each charter file the registry places on this host (<home>/<charter>/<file>).
coordination_homes() {
  local here host path
  here=$(hostname -s)
  printf '%s\n' "${COORDINATION_HOME:-$HOME/.handoffs}"
  sed -n 's/^|[^|]*| *\([^:| ]*\):\([^ |]*\).*/\1 \2/p' "$1" |
    while read -r host path; do
      [ "$host" = "$here" ] || [ "$host" = localhost ] || continue
      path=${path/#\~/$HOME}
      dirname "$(dirname "$path")"
    done
}

coordinator_exceptions() { # <registry>
  local homes home leases shells charter held lease_state status shell key file seen=" "
  homes=$(coordination_homes "$1" | sort -u)
  leases=""
  while read -r home; do
    leases=$leases$(COORDINATION_HOME=$home "$COORDINATOR_SCRIPTS/lease.sh" list)$'\n' || return 0
  done <<< "$homes"
  shells=$(sox_cmd ls localhost --json 2>/dev/null) || return 0
  while IFS=$'\t' read -r charter _ held lease_state status _ shell _; do
    [ -n "$charter" ] && [ "$charter" != "$CHARTER" ] && [ "$held" = held ] && [ "$lease_state" = live ] || continue
    key=coordinator-$charter
    seen="$seen$key "
    case $status in
      gone) report "$key" "COORDINATOR GONE $charter shell $shell (lease state=live)" ;;
      alive)
        if jq -e --arg shell "$shell" 'select(.kind == "shell" and .backing_id == $shell)
            | tostring | test("hit your [^\"]*limit"; "i")' <<< "$shells" > /dev/null; then
          report "$key" "COORDINATOR LIMIT-STOPPED $charter shell $shell"
        else
          resolve "$key"
        fi ;;
      *) ;; # unknown: sox could not say, so what was reported stands
    esac
  done <<< "$leases"
  for file in "$state_dir"/coordinator-*; do
    [ -e "$file" ] || continue
    case $seen in *" ${file##*/} "*) ;; *) resolve "${file##*/}" ;; esac
  done
}

quota_exceptions() {
  local quotas account percent resets threshold
  quotas=$(timeout 90 agent-quota --json 2>/dev/null | jq -rR 'fromjson? | .account as $account
      | (.windows // [])[] | select(.name == "weekly" and .used_percent != null)
      | [$account, (.used_percent | floor), (.resets_at // "-")] | @tsv') || return 0
  while IFS=$'\t' read -r account percent resets; do
    [ -n "$account" ] || continue
    for threshold in $QUOTA_THRESHOLDS; do
      if [ "$percent" -ge "$threshold" ]; then
        report "quota-$account-$threshold" "QUOTA $account weekly ${percent}% (>= ${threshold}%), resets $resets"
        break
      fi
      resolve "quota-$account-$threshold"
    done
  done <<< "$quotas"
}

host_exceptions() { # <fleet>
  local host used down_since
  for host in $(jq -r '.hosts | keys[]' "$1"); do
    down_since=$state_dir/.down-since-$host
    if ! used=$(on_host "$host" disk_used_percent); then
      [ -f "$down_since" ] || date +%s > "$down_since"
      if [ $(( $(date +%s) - $(cat "$down_since") )) -ge "$HOST_DOWN_S" ]; then
        report "unreachable-$host" "HOST UNREACHABLE $host by plain ssh for $(( HOST_DOWN_S / 60 ))+ min"
      fi
      continue
    fi
    rm -f "$down_since"
    resolve "unreachable-$host"
    case $used in ''|*[!0-9]*) continue ;; esac # no df figure: nothing to judge
    if [ $(( 100 - used )) -lt "$DISK_FREE_PERCENT_MIN" ]; then
      report "disk-$host" "DISK $host ${used}% used (under ${DISK_FREE_PERCENT_MIN}% free)"
    else
      resolve "disk-$host"
    fi
  done
}

exceptions() {
  local fleet="" state_dir="" every=$EXCEPTIONS_EVERY_S registry
  while [ $# -gt 0 ]; do
    [ $# -ge 2 ] || usage
    case $1 in
      --fleet) fleet=$2 ;;
      --state) state_dir=$2 ;;
      --every) every=$2 ;;
      *) usage ;;
    esac
    shift 2
  done
  case "$fleet" in /*) ;; *) fail "--fleet must be an absolute path" 2 ;; esac
  [ -n "$state_dir" ] || fail "--state DIR is required: it keeps what was reported across restarts" 2
  case "$every" in ''|*[!0-9]*|0) fail "--every must be a whole number of seconds above 0" 2 ;; esac
  registry=$(dirname "$fleet")/fleet.md
  [ -f "$registry" ] || fail "no charter registry at $registry" 2
  command -v timeout > /dev/null || fail "timeout(1) not found on PATH" 2
  mkdir -p "$state_dir"
  rm -f "$state_dir/.printed"
  # Runs until a pass prints: the caller is woken by the exit.
  while :; do
    coordinator_exceptions "$registry"
    quota_exceptions
    host_exceptions "$fleet"
    if [ -e "$state_dir/.printed" ]; then
      rm "$state_dir/.printed"
      return 0
    fi
    sleep "$every"
  done
}

[ $# -ge 1 ] || usage
command=$1
shift
case "$command" in
  take) take "$@" ;;
  exceptions) exceptions "$@" ;;
  watch) watch "$@" ;;
  pass) pass "$@" ;;
  *) usage ;;
esac
