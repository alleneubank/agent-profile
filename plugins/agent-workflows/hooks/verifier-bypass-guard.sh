#!/usr/bin/env bash
# PreToolUse hook: make git verifier bypasses visible and stop the silent
# habit. Law (AGENTS.md / doctrine): bypasses such as --no-verify are never
# a shortcut — but the law had no floor, and unenforced it went dead-letter.
#
# Weakest-valid scope: denies only the two observed bypass shapes —
# `--no-verify` on a git command, and hooksPath forced to /dev/null.
# Named permitted neighbors: setting core.hooksPath to a real directory
# (legitimate hook management), and an explicit human-ordered bypass via a
# transcript-visible HOOK_BYPASS_APPROVED=1 prefix on the command.
#
# Fail-open by design: this is a visibility floor, not a security boundary;
# a parse failure must never block unrelated commands.
set -uo pipefail

input="$(cat 2>/dev/null)" || input=""

command=""
if command -v jq >/dev/null 2>&1; then
    command="$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)" || command=""
fi
# jq unavailable or unexpected payload shape: match the raw payload. Coarser,
# but the matcher already restricts this hook to shell tools, and a deny here
# still carries the escape hatch.
[[ -z "$command" ]] && command="$input"

deny() {
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$1"
    exit 0
}

# Explicit, transcript-visible authorization escape hatch: only on the
# human's order, never self-granted.
if [[ "$command" == *"HOOK_BYPASS_APPROVED=1"* ]]; then
    exit 0
fi

if [[ "$command" == *git* ]]; then
    if [[ "$command" == *--no-verify* ]]; then
        deny "git --no-verify bypasses the repo verifier; law: bypasses are never a shortcut. Debug or fix the failing hook instead. If the human explicitly ordered this bypass, re-run the command prefixed with HOOK_BYPASS_APPROVED=1 to record the authorization."
    fi
    if [[ "$command" == *"hooksPath=/dev/null"* ]]; then
        deny "forcing core.hooksPath=/dev/null silently disables repo hooks; law: bypasses are never a shortcut. Debug or fix the failing hook instead. If the human explicitly ordered this bypass, re-run the command prefixed with HOOK_BYPASS_APPROVED=1 to record the authorization."
    fi
fi

exit 0
