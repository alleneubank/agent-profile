#!/usr/bin/env bash
# SessionStart/SubagentStart hook: emit the instruction-version fingerprint
# as additionalContext so session transcripts can be bucketed by instruction
# version (the eval skill's A/B input). The event name arrives as $1 —
# SubagentStart coverage exists because subagent and worker transcripts
# carried no stamp, capping version A/Bs at top-level sessions.
#
# Must stay fast (runs on every session) and must never block session
# start: any lookup failure degrades to "unknown" instead of exiting
# non-zero.
set -uo pipefail

event="${1:-SessionStart}"

fingerprint="unknown"

# On machines managed by claude-bootstrap, ~/.claude/CLAUDE.md symlinks into
# the agent-profile checkout; resolving it locates the repo without
# hardcoding a path. pwd -P canonicalizes relative symlink targets.
claude_md="$HOME/.claude/CLAUDE.md"
if [[ -L "$claude_md" ]]; then
    target="$(readlink "$claude_md")"
    case "$target" in
        /*) : ;;
        *) target="$(dirname "$claude_md")/$target" ;;
    esac
    repo_dir="$(cd "$(dirname "$target")" 2>/dev/null && pwd -P)" || repo_dir=""
    if [[ -n "$repo_dir" ]]; then
        sha="$(git -C "$repo_dir" rev-parse --short HEAD 2>/dev/null)" || sha=""
        if [[ -n "$sha" ]]; then
            # A dirty checkout is not a clean instruction version; mark it so
            # the eval can exclude or bucket those sessions separately.
            dirty=""
            git -C "$repo_dir" diff --quiet HEAD -- 2>/dev/null || dirty="+dirty"
            fingerprint="agent-profile@${sha}${dirty}"
            # Plugin versions from the same checkout's manifests: the local
            # marketplace installs from this checkout, so these match the
            # installed skill surface. sed instead of jq — jq is not
            # guaranteed on every host and the value charset is semver-safe.
            for plugin in engineering-practices agent-workflows; do
                manifest="$repo_dir/plugins/$plugin/.claude-plugin/plugin.json"
                if [[ -f "$manifest" ]]; then
                    v="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$manifest" | head -1)"
                    [[ -n "$v" ]] && fingerprint="$fingerprint $plugin@$v"
                fi
            done
        fi
    fi
fi

printf '{"hookSpecificOutput":{"hookEventName":"%s","additionalContext":"instruction-fingerprint: %s"}}\n' "$event" "$fingerprint"
