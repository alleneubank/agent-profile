#!/usr/bin/env bash
# Measure which skills actually fire, from agent transcripts.
#
# Skill discovery rides descriptions alone, so a skill whose description never
# matches is dead law: it ships, it validates, and nothing ever reads it. This
# is the detector for that. It reports real invocation counts and — the part
# that matters — names the skills in this repo that have never fired at all.
#
# It parses the transcript JSON rather than grepping it. Grep cannot tell an
# invocation from the skill *listing* injected into every session, nor from a
# session that merely discusses a skill by name; both read as hits and both
# produce confident wrong answers.
#
# Coverage is Claude Code only, because it is the only harness with a typed
# Skill tool. Codex and pi DO record their invocations — both load a skill by
# reading its SKILL.md, so the call lands as an exec/bash/read of a path under
# the installed plugin cache — this detector just does not parse those yet
# (0xsend/recall#97 tracks the same gap in recall's own extraction). Treat a
# zero as "never fired under Claude Code", never as "never fired".
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TRANSCRIPT_ROOT="${SKILL_USAGE_ROOT:-$HOME/.claude/projects}"
SINCE=""
PLUGIN=""
FORMAT="text"

usage() {
  cat <<'EOF'
usage: skill-usage.sh [--since <N>d|<N>h] [--plugin <name>] [--root <dir>] [--json]

  --since   only count invocations newer than this (e.g. 7d, 36h)
  --plugin  restrict the report to one plugin (e.g. engineering-practices)
  --root    transcript root (default ~/.claude/projects, or $SKILL_USAGE_ROOT)
  --json    emit machine-readable JSON instead of a table

Exit 2 means the detector found no skill invocations anywhere in the root,
regardless of --since. That is a broken detector or a wrong root, never
evidence that no skill ran.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --since) SINCE="${2:-}"; shift 2 ;;
    --plugin) PLUGIN="${2:-}"; shift 2 ;;
    --root) TRANSCRIPT_ROOT="${2:-}"; shift 2 ;;
    --json) FORMAT="json"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 64 ;;
  esac
done

python3 - "$ROOT" "$TRANSCRIPT_ROOT" "$SINCE" "$PLUGIN" "$FORMAT" <<'PY'
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

repo_root, transcript_root, since_arg, plugin_filter, fmt = sys.argv[1:6]

# Bound the walk. A runaway root (a home directory, a mounted backup) would
# otherwise turn a status check into an unbounded scan.
MAX_FILES = 20000

def parse_since(spec):
    """'7d' / '36h' -> an aware cutoff, or None when unset."""
    if not spec:
        return None
    match = re.fullmatch(r"(\d+)([dh])", spec)
    if not match:
        raise SystemExit(f"invalid --since (want <N>d or <N>h): {spec}")
    amount, unit = int(match.group(1)), match.group(2)
    delta = timedelta(days=amount) if unit == "d" else timedelta(hours=amount)
    return datetime.now(timezone.utc) - delta

def parse_timestamp(raw):
    """Transcript stamps are ISO-8601, sometimes Z-suffixed, sometimes naive."""
    if not isinstance(raw, str):
        return None
    try:
        stamp = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    return stamp if stamp.tzinfo else stamp.replace(tzinfo=timezone.utc)

def declared_skills(root):
    """Every skill this repo ships, as '<plugin>:<skill>'."""
    found = set()
    for skill_md in sorted(Path(root).glob("plugins/*/skills/*/SKILL.md")):
        plugin = skill_md.parents[2].name
        found.add(f"{plugin}:{skill_md.parent.name}")
    return found

cutoff = parse_since(since_arg)

transcripts = Path(transcript_root)
if not transcripts.is_dir():
    raise SystemExit(f"transcript root is not a directory: {transcripts}")

files = sorted(transcripts.rglob("*.jsonl"))
truncated = len(files) > MAX_FILES
files = files[:MAX_FILES]

# `observed` is the windowed answer the caller asked for. `control` counts every
# invocation in the root regardless of --since, and exists only to prove the
# detector still matches the transcript schema: on any real agent host some
# skill has fired at some point, so a zero control means the parser broke or the
# root is wrong. Deriving the control from the same pass keeps the two honest.
observed = {}
observed_sessions = {}
control = 0
scanned = 0

for path in files:
    try:
        handle = path.open(encoding="utf-8", errors="replace")
    except OSError:
        continue
    scanned += 1
    with handle:
        for line in handle:
            # Cheap prefilter: json.loads on every line of every transcript is
            # the difference between seconds and minutes.
            if '"Skill"' not in line:
                continue
            try:
                record = json.loads(line)
            except (ValueError, TypeError):
                continue
            message = record.get("message")
            if not isinstance(message, dict):
                continue
            content = message.get("content")
            if not isinstance(content, list):
                continue
            for block in content:
                if not isinstance(block, dict):
                    continue
                if block.get("type") != "tool_use" or block.get("name") != "Skill":
                    continue
                skill = (block.get("input") or {}).get("skill")
                if not isinstance(skill, str) or ":" not in skill:
                    continue
                control += 1
                stamp = parse_timestamp(record.get("timestamp"))
                if cutoff and (stamp is None or stamp < cutoff):
                    continue
                observed[skill] = observed.get(skill, 0) + 1
                session = record.get("sessionId") or record.get("session_id")
                if session:
                    observed_sessions.setdefault(skill, set()).add(session)

declared = declared_skills(repo_root)
if plugin_filter:
    declared = {s for s in declared if s.startswith(f"{plugin_filter}:")}
    observed = {s: n for s, n in observed.items() if s.startswith(f"{plugin_filter}:")}

fired = sorted(observed.items(), key=lambda kv: (-kv[1], kv[0]))
never = sorted(declared - set(observed))
window = since_arg or "all time"

# Fail closed, and fail *before* the report. A detector that stopped matching
# produces a zero indistinguishable from a true zero, and printing the report
# anyway dresses a broken parser up as a finding — every skill listed as never
# fired, which is exactly the shape of a real result.
if control == 0:
    print(
        f"FAIL: no skill invocations found anywhere under {transcripts}, "
        f"ignoring --since.\nThe detector is broken or the root is wrong; this "
        f"is not evidence that no skill ran.",
        file=sys.stderr,
    )
    raise SystemExit(2)

if fmt == "json":
    print(json.dumps({
        "transcript_root": str(transcripts),
        "transcripts_scanned": scanned,
        "transcripts_truncated": truncated,
        "window": window,
        "control_total": control,
        "fired": [
            {"skill": s, "invocations": n, "sessions": len(observed_sessions.get(s, ()))}
            for s, n in fired
        ],
        "never_fired": never,
        "coverage": "claude-code",
    }, indent=2))
else:
    print(f"transcripts : {scanned} scanned under {transcripts}")
    if truncated:
        print(f"WARNING     : capped at {MAX_FILES} files; counts are a lower bound")
    print(f"window      : {window}")
    print(f"coverage    : Claude Code only (codex/pi invocations are recorded, not yet parsed)")
    print()
    if fired:
        width = max(len(s) for s, _ in fired)
        print(f"{'skill'.ljust(width)}  invocations  sessions")
        for skill, count in fired:
            print(f"{skill.ljust(width)}  {count:>11d}  {len(observed_sessions.get(skill, ())):>8d}")
    else:
        print("(no invocations in window)")
    print()
    scope = plugin_filter or "this repo"
    if never:
        print(f"NEVER FIRED in {window} ({len(never)} of {len(declared)} skills in {scope}):")
        for skill in never:
            print(f"  {skill}")
    else:
        print(f"every skill in {scope} fired at least once in {window}")
PY
