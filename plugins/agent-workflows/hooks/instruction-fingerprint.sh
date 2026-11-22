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

# On machines managed by claude-bootstrap or install.sh, harness instruction
# links point into the agent-profile checkout; resolving the first present link
# (or falling back to this hook's own checkout root) locates the repo without
# hardcoding a path. pwd -P canonicalizes relative symlink targets.
repo_dir=""
for link_path in \
    "$HOME/.claude/CLAUDE.md" \
    "$HOME/.gemini/config/AGENTS.md" \
    "$HOME/.codex/AGENTS.md"
do
    if [[ -L "$link_path" ]]; then
        target="$(readlink "$link_path")"
        case "$target" in
            /*) : ;;
            *) target="$(dirname "$link_path")/$target" ;;
        esac
        repo_dir="$(cd "$(dirname "$target")" 2>/dev/null && pwd -P)" || repo_dir=""
        [[ -n "$repo_dir" ]] && break
    fi
done
if [[ -z "$repo_dir" ]]; then
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd -P)" || script_dir=""
    if [[ -n "$script_dir" && -f "$script_dir/../../../AGENTS.md" ]]; then
        repo_dir="$(cd "$script_dir/../../.." 2>/dev/null && pwd -P)" || repo_dir=""
    fi
fi

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

printf '{"hookSpecificOutput":{"hookEventName":"%s","additionalContext":"instruction-fingerprint: %s"}}\n' "$event" "$fingerprint"
