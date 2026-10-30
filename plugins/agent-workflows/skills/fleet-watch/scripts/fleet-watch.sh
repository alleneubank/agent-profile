#!/usr/bin/env bash
# The fleet watch's own commands, run from its sox shell on the control host.
#
#   fleet-watch.sh take  --reason TEXT
#   fleet-watch.sh watch
#   fleet-watch.sh pass  --fleet PATH
#
# take   takes the fleet-watch lease (lease.sh take) and labels this shell
#        role=fleet-watch charter=fleet-watch. The lease it prints names the
#        predecessor's session and shell in prior=; retiring that shell is the
#        caller's act, by that id.
# watch  streams every shell and host on every daemon and prints one line per
#        event the watch acts on: BLOCKED and ERROR from a coordinator,
#        ANSWERED when a coordinator leaves blocked, STUCK >10m for a lane
#        blocked that long, UNSTUCK when it moves on, GONE MID-WORK for a shell
#        that exited while working or blocked, and HOST lines for a host
#        unreachable past 60 s and its recovery. Its own shell is excluded, so
#        its turns ending never wake it. Raw events go to
#        $FLEET_WATCH_DIR/raw.log (~/Work/fleet-watch), rotated at 50 MB.
# pass   prints one snapshot: the lease check, lane slots per host, each
#        coordinator shell with its attention and transcript age, and load and
#        disk per capped host.
#
# Exit: 0 ok, 2 usage, otherwise the failing lease.sh, sox, or lane.sh code.
# Needs bash 3.2+, jq, perl, and the coordinator skill's scripts beside this
# skill. Tests override COORDINATION_HOME, SOX_BIN, and FLEET_WATCH_DIR.
set -euo pipefail

CHARTER="fleet-watch"
RAW_LOG_BYTES_MAX=50000000
HOST_GRACE_S=60
STUCK_S=600

usage() {
  sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//' >&2
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

pass() {
  [ $# -eq 2 ] && [ "$1" = --fleet ] || usage
  local fleet=$2 status=0 shell charter attention session file age host local_host probe
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
  local_host=$(hostname -s)
  for host in $(jq -r '.hosts | keys[]' "$fleet"); do
    printf '%s: ' "$host"
    if [ "$host" = "$local_host" ] || [ "$host" = localhost ]; then
      load_and_disk
    elif probe=$({ declare -f load_and_disk; echo load_and_disk; } |
        ssh -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=2 "$host" 'bash -s' 2>&1); then
        printf '%s\n' "${probe##*$'\n'}"
      else
        printf 'unreachable: %s\n' "${probe##*$'\n'}"
    fi
  done
}

[ $# -ge 1 ] || usage
command=$1
shift
case "$command" in
  take) take "$@" ;;
  watch) watch "$@" ;;
  pass) pass "$@" ;;
  *) usage ;;
esac
