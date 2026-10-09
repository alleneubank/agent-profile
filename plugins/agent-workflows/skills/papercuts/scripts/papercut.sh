#!/usr/bin/env bash
# Record friction an agent worked around, or hand the queue to triage.
#
#   papercut.sh "<what slowed you down, and the workaround>"
#   papercut.sh --take
#
# A report appends one Markdown line to this host's queue:
#   - <UTC time> <host> <repository or directory> [<branch>]: <report>
# Newlines in the report are folded into spaces, so one report is one line.
#
# --take moves the queue aside to triaged/<UTC time>.md with a rename, so
# reports written during triage land in a fresh queue, and prints that path.
# With nothing queued it prints nothing and exits 0.
#
# Exit: 0 recorded or taken, 2 usage, 3 report too long.
# Tests override SHARPENING_HOME; it defaults to ~/.handoffs/sharpening.
set -eu

REPORT_CHARS_MAX=1000

usage() {
  sed -n '4,5p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

home=${SHARPENING_HOME:-$HOME/.handoffs/sharpening}
queue="$home/papercuts.md"
now=$(date -u +%Y-%m-%dT%H:%M:%SZ)

[ $# -eq 1 ] || usage
[ -n "$1" ] || usage

if [ "$1" = "--take" ]; then
  [ -s "$queue" ] || exit 0
  mkdir -p "$home/triaged"
  taken="$home/triaged/$now.md"
  [ ! -e "$taken" ] || taken="$home/triaged/$now-$$.md"
  mv "$queue" "$taken"
  printf '%s\n' "$taken"
  exit 0
fi

report=$(printf '%s' "$1" | tr '\r\n' '  ')
if [ "${#report}" -gt "$REPORT_CHARS_MAX" ]; then
  echo "papercut.sh: report longer than $REPORT_CHARS_MAX characters; say it in one or two sentences" >&2
  exit 3
fi

if top=$(git rev-parse --show-toplevel 2>/dev/null); then
  place=${top/#$HOME/\~}
  branch=$(git branch --show-current 2>/dev/null || true)
  [ -z "$branch" ] || place="$place [$branch]"
else
  place=${PWD/#$HOME/\~}
fi
host=$(hostname -s)

mkdir -p "$home"
# One short append per report, so concurrent reporters do not split lines.
printf -- '- %s %s %s: %s\n' "$now" "$host" "$place" "$report" >> "$queue"
