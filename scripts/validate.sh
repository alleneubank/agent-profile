#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

require_json() {
  local path="$1"
  if command -v jq >/dev/null 2>&1; then
    jq empty "$path" >/dev/null
  else
    python3 -m json.tool "$path" >/dev/null
  fi
  echo "json ok: $path"
}

validate_skill() {
  local skill_dir="$1"
  python3 - "$skill_dir" <<'PY'
import re
import sys
from pathlib import Path

skill_dir = Path(sys.argv[1])
skill_md = skill_dir / "SKILL.md"
if not skill_md.is_file():
    raise SystemExit(f"missing SKILL.md: {skill_dir}")

content = skill_md.read_text(encoding="utf-8")
match = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
if not match:
    raise SystemExit(f"missing YAML frontmatter: {skill_md}")

frontmatter = {}
for raw_line in match.group(1).splitlines():
    if not raw_line.strip() or raw_line.lstrip().startswith("#"):
        continue
    if ":" not in raw_line:
        raise SystemExit(f"invalid frontmatter line in {skill_md}: {raw_line}")
    key, value = raw_line.split(":", 1)
    key = key.strip()
    value = value.strip().strip('"').strip("'")
    frontmatter[key] = value

name = frontmatter.get("name", "")
description = frontmatter.get("description", "")
if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name):
    raise SystemExit(f"invalid skill name in {skill_md}: {name!r}")
if not description:
    raise SystemExit(f"missing skill description in {skill_md}")
if "<" in description or ">" in description:
    raise SystemExit(f"skill description contains angle brackets in {skill_md}")

print(f"skill ok: {skill_dir}")
PY
}

run_python_with_yaml() {
  local script="$1"
  shift

  if python3 -c 'import yaml' >/dev/null 2>&1; then
    python3 "$script" "$@"
    return
  fi

  if command -v uv >/dev/null 2>&1; then
    uv run --with pyyaml python "$script" "$@"
    return
  fi

  echo "skip: $script requires PyYAML; install PyYAML or uv" >&2
  return 0
}

require_json "$ROOT/marketplace.json"
require_json "$ROOT/.claude-plugin/marketplace.json"
require_json "$ROOT/plugins/engineering-practices/.codex-plugin/plugin.json"
require_json "$ROOT/plugins/engineering-practices/.claude-plugin/plugin.json"
require_json "$ROOT/plugins/agent-workflows/.codex-plugin/plugin.json"
require_json "$ROOT/plugins/agent-workflows/.claude-plugin/plugin.json"

if command -v claude >/dev/null 2>&1; then
  claude plugin validate --strict "$ROOT/.claude-plugin/marketplace.json"
  claude plugin validate --strict "$ROOT/plugins/engineering-practices"
  claude plugin validate --strict "$ROOT/plugins/agent-workflows"
else
  echo "skip: claude plugin validation (claude CLI not found)"
fi

if [ -n "${CODEX_VALIDATOR:-}" ] && [ -f "$CODEX_VALIDATOR" ]; then
  run_python_with_yaml "$CODEX_VALIDATOR" "$ROOT/plugins/engineering-practices"
  run_python_with_yaml "$CODEX_VALIDATOR" "$ROOT/plugins/agent-workflows"
else
  echo "skip: codex plugin schema validation (set CODEX_VALIDATOR to validate_plugin.py)"
fi

find "$ROOT/plugins" -mindepth 3 -maxdepth 3 -type d -path '*/skills/*' -print0 \
  | sort -z \
  | while IFS= read -r -d '' skill_dir; do
      validate_skill "$skill_dir"
    done
