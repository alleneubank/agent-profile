#!/usr/bin/env bash
# Print the brief for one of this skill's invited roles: the role's charter
# text followed by every input the charter declares.
#
#   review-brief.sh ROLE INPUTS_DIR [EARLIER_BLOCKING_FINDINGS_FILE] > brief.md
#
# ROLE names a charter in ../references (guest, design-reviewer,
# plan-reviewer, specialist). The charter declares its inputs on one line:
#   <!-- brief-inputs: goal scenarios threat-model -->
# and INPUTS_DIR holds one non-empty file per input, named <input>.md. An
# input that does not apply still gets a file saying so.
#
# The brief carries the charter's text, not its path, because a reviewer on
# another harness, account, or host cannot read this skill's directory. It has
# no place for a question of the requester's own: the charter's Judge
# paragraph is the question. For a later round, the third argument is a file
# quoting the earlier round's blocking findings, and the brief asks only
# whether they are closed.
#
# Exit: 0 printed, 2 usage, 3 unknown role or a charter that declares no
# inputs, 4 an input file missing or empty (every one is named), 5 an input
# file over the size limit.
set -eu

# A brief is read in full by a reviewer; an input larger than this is a
# document to cite by path or ref, not to paste.
INPUT_BYTES_MAX=20000

fail() {
  echo "review-brief.sh: $1" >&2
  exit "$2"
}

[ $# -eq 2 ] || [ $# -eq 3 ] || fail "usage: review-brief.sh ROLE INPUTS_DIR [EARLIER_BLOCKING_FINDINGS_FILE]" 2
role=$1 inputs_dir=$2 earlier_findings=${3:-}

references=$(cd "$(dirname "$0")/../references" && pwd)
charter="$references/$role.md"
case "$role" in
  */* | "") fail "unknown role: $role" 3 ;;
esac
[ -f "$charter" ] || fail "unknown role: $role" 3

declared=$(sed -n 's/^<!-- brief-inputs: \(.*\) -->$/\1/p' "$charter")
[ -n "$declared" ] || fail "charter declares no brief inputs: $charter" 3

missing=""
for input in $declared; do
  file="$inputs_dir/$input.md"
  if [ ! -s "$file" ]; then
    missing="$missing $input.md"
  elif [ "$(wc -c < "$file")" -gt "$INPUT_BYTES_MAX" ]; then
    fail "$file is over $INPUT_BYTES_MAX bytes; cite the document instead of pasting it" 5
  fi
done
[ -z "$missing" ] || fail "missing or empty in $inputs_dir:$missing" 4
if [ -n "$earlier_findings" ] && [ ! -s "$earlier_findings" ]; then
  fail "missing or empty: $earlier_findings" 4
fi

grep -v '^<!-- brief-inputs: ' "$charter"
for input in $declared; do
  printf '\n## Input: %s\n\n' "$input"
  cat "$inputs_dir/$input.md"
done
if [ -n "$earlier_findings" ]; then
  printf '\n## This round\n\n'
  echo "The earlier round's blocking findings follow. Say whether each is closed at"
  echo "this head and whether the fix broke a scenario. Raise nothing else unless it"
  echo "is blocking."
  echo
  cat "$earlier_findings"
fi
