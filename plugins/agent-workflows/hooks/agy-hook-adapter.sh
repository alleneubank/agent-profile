#!/usr/bin/env bash
# Antigravity (agy) hook adapter for the agent-workflows plugin.
#
# Antigravity uses a camelCase JSON wire contract distinct from Claude/Codex
# (hooks.json at plugin root, toolCall.args.CommandLine, injectSteps /
# decision). This adapter translates between Antigravity's payloads and the
# canonical shell hooks without duplicating hook policy — mirroring
# extensions/pi-hooks.ts:
#
#   SessionStart                -> hooks/instruction-fingerprint.sh SessionStart
#   PreToolUse (run_command)    -> hooks/verifier-bypass-guard.sh
#   coordinator-session.sh      -> skipped: only Claude Code sessions hold a
#                                  coordinator lease
#
# Fail-open by design: a parse failure, missing python3, or script error never
# blocks session start or unrelated commands.
set -uo pipefail

event="${1:-}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd -P)" || exit 0
fingerprint_script="$script_dir/instruction-fingerprint.sh"
guard_script="$script_dir/verifier-bypass-guard.sh"

fail_open() {
    if [[ "$event" == "PreToolUse" ]]; then
        printf '{"decision":"allow"}\n'
    else
        printf '{}\n'
    fi
    exit 0
}

command -v python3 >/dev/null 2>&1 || fail_open

case "$event" in
    SessionStart)
        # Drain stdin so the caller never hits SIGPIPE.
        cat >/dev/null 2>&1 || true
        [[ -x "$fingerprint_script" ]] || fail_open
        raw="$("$fingerprint_script" SessionStart 2>/dev/null)" || fail_open
        python3 - "$raw" <<'PY' || fail_open
import json
import sys

raw = sys.argv[1].strip()
start = raw.find("{")
if start < 0:
    print("{}")
    raise SystemExit(0)
try:
    data = json.loads(raw[start:])
except json.JSONDecodeError:
    print("{}")
    raise SystemExit(0)
context = (data.get("hookSpecificOutput") or {}).get("additionalContext")
if not isinstance(context, str) or not context:
    print("{}")
    raise SystemExit(0)
print(json.dumps({
    "injectSteps": [
        {
            "systemMessage": {
                "systemMessage": context,
            }
        }
    ]
}))
PY
        ;;
    PreToolUse)
        input="$(cat 2>/dev/null)" || input=""
        [[ -x "$guard_script" ]] || fail_open
        python3 - "$guard_script" "$input" <<'PY' || fail_open
import json
import subprocess
import sys

guard_script, raw_input = sys.argv[1], sys.argv[2]

try:
    payload = json.loads(raw_input) if raw_input.strip() else {}
except json.JSONDecodeError:
    print(json.dumps({"decision": "allow"}))
    raise SystemExit(0)

if not isinstance(payload, dict):
    print(json.dumps({"decision": "allow"}))
    raise SystemExit(0)

tool_call = payload.get("toolCall")
args = tool_call.get("args") if isinstance(tool_call, dict) else None
command = args.get("CommandLine") if isinstance(args, dict) else None
if not isinstance(command, str) or not command:
    print(json.dumps({"decision": "allow"}))
    raise SystemExit(0)

forwarded = json.dumps({"tool_input": {"command": command}})
try:
    proc = subprocess.run(
        ["bash", guard_script],
        input=forwarded,
        text=True,
        capture_output=True,
        timeout=5,
        check=False,
    )
except Exception:
    print(json.dumps({"decision": "allow"}))
    raise SystemExit(0)

if proc.returncode != 0:
    print(json.dumps({"decision": "allow"}))
    raise SystemExit(0)

stdout = proc.stdout.strip()
start = stdout.find("{")
if start < 0:
    print(json.dumps({"decision": "allow"}))
    raise SystemExit(0)

try:
    result = json.loads(stdout[start:])
except json.JSONDecodeError:
    print(json.dumps({"decision": "allow"}))
    raise SystemExit(0)

specific = result.get("hookSpecificOutput") if isinstance(result, dict) else None
if isinstance(specific, dict) and specific.get("permissionDecision") == "deny":
    reason = specific.get("permissionDecisionReason") or "Blocked by verifier-bypass-guard hook"
    print(json.dumps({"decision": "deny", "reason": reason}))
else:
    print(json.dumps({"decision": "allow"}))
PY
        ;;
    *)
        fail_open
        ;;
esac
