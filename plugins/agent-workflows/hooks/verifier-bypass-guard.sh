#!/usr/bin/env bash
# PreToolUse hook: make git verifier bypasses visible and stop the silent
# habit. Law (AGENTS.md / doctrine): bypasses such as --no-verify are never
# a shortcut — but the law had no floor, and unenforced it went dead-letter.
#
# Weakest-valid scope: denies only the two observed bypass shapes —
# `--no-verify` on a git command, and hooksPath forced to /dev/null.
# Named permitted neighbors: setting core.hooksPath to a real directory
# (legitimate hook management), text that only mentions a bypass (a report
# heredoc, a PR body, a commit message), and an explicit human-ordered bypass
# via a transcript-visible HOOK_BYPASS_APPROVED=1 prefix on the command.
#
# Fail-open by design: this is a visibility floor, not a security boundary;
# a parse failure must never block unrelated commands.
set -uo pipefail

input="$(cat 2>/dev/null)" || input=""

deny() {
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$1"
    exit 0
}

readonly REASON_SUFFIX="law: bypasses are never a shortcut. Debug or fix the failing hook instead. If the human explicitly ordered this bypass, re-run the command prefixed with HOOK_BYPASS_APPROVED=1 to record the authorization."
deny_no_verify() { deny "git --no-verify bypasses the repo verifier; $REASON_SUFFIX"; }
deny_hooks_path() { deny "forcing core.hooksPath=/dev/null silently disables repo hooks; $REASON_SUFFIX"; }

# Explicit, transcript-visible authorization escape hatch: only on the
# human's order, never self-granted.
if [[ "$input" == *"HOOK_BYPASS_APPROVED=1"* ]]; then
    exit 0
fi

command=""
if command -v jq >/dev/null 2>&1; then
    command="$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)" || command=""
fi

# jq unavailable or unexpected payload shape: the command cannot be told from
# the text around it, so match the raw payload. Coarser, but the matcher
# already restricts this hook to shell tools, and a deny here still carries
# the escape hatch.
if [[ -z "$command" ]]; then
    if [[ "$input" == *git* ]]; then
        [[ "$input" == *--no-verify* ]] && deny_no_verify
        [[ "$input" == *"hooksPath=/dev/null"* ]] && deny_hooks_path
    fi
    exit 0
fi

# Heredoc bodies are data, not commands. Drop each body, keep the line that
# opens it, and join the rest into one line with `;` between commands.
flat="$(printf '%s\n' "$command" | awk '
    delimiter != "" {
        line = $0
        sub(/^[ \t]+/, "", line)
        if (line == delimiter) delimiter = ""
        next
    }
    {
        if (match($0, /<<-?[ \t]*["\047]?[A-Za-z_][A-Za-z0-9_]*/)) {
            delimiter = substr($0, RSTART, RLENGTH)
            sub(/^<<-?[ \t]*["\047]?/, "", delimiter)
        }
        if (sub(/\\$/, " ")) printf "%s", $0
        else printf "%s;", $0
    }
' 2>/dev/null)" || flat=""
[[ -z "$flat" ]] && exit 0

# The flag is never quoted in a real invocation, so quoted text (a message, a
# PR body) is dropped before looking for it. A hooksPath value can be quoted,
# so that check reads the text with its quotes removed but their content kept.
unquoted="$(printf '%s' "$flat" | sed -E "s/'[^']*'//g; s/\"([^\"\\\\]|\\\\.)*\"//g" 2>/dev/null)" || unquoted=""
dequoted="$(printf '%s' "$flat" | tr -d "\"'" 2>/dev/null)" || dequoted=""

# A git invocation: `git` as the command word of a pipeline segment, after any
# environment assignments and pass-through wrappers.
readonly GIT_WORD='(^|[;&|(`])[[:space:]]*(([A-Za-z_][A-Za-z0-9_]*=[^[:space:];&|]*|env|command|exec|sudo|time|nohup)[[:space:]]+)*git[[:space:]]([^;&|]*[[:space:]])?'

readonly NO_VERIFY_CALL="${GIT_WORD}--no-verify([[:space:];&|)]|\$)"
readonly HOOKS_PATH_CALL="${GIT_WORD}[^;&|]*hooksPath=/dev/null"

if [[ "$unquoted" =~ $NO_VERIFY_CALL ]]; then
    deny_no_verify
fi
# The value sits inside one argument (`-c core.hooksPath=/dev/null`), so no
# word boundary is required before it. A git commit message that names this
# shape is still denied; the escape hatch covers it.
if [[ "$dequoted" =~ $HOOKS_PATH_CALL ]]; then
    deny_hooks_path
fi

exit 0
