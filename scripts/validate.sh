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

# Cross-manifest parity gate. The other checks lint each manifest in isolation;
# this asserts the parallel Claude and Codex manifests describe the same plugins
# at the same versions, so a release can't ship mismatched claude vs codex (the
# failure the rest of validate.sh is blind to). Pure stdlib so the pre-push hook
# has no dependency beyond python3.
check_manifest_parity() {
  python3 - "$ROOT" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
plugins_dir = root / "plugins"
errors = []

def load(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        errors.append(f"missing manifest: {path}")
    except json.JSONDecodeError as exc:
        errors.append(f"invalid json in {path}: {exc}")
    return None

# Plugins are discovered from the directory tree; that on-disk set is the source
# of truth both marketplaces must agree with.
plugin_dirs = sorted(p for p in plugins_dir.iterdir() if p.is_dir())
dir_names = {p.name for p in plugin_dirs}

# Versioned Claude marketplace: name -> entry.
claude_mp = load(root / ".claude-plugin" / "marketplace.json")
claude_mp_entries = {}
if claude_mp is not None:
    for entry in claude_mp.get("plugins", []):
        claude_mp_entries[entry.get("name")] = entry

# Root (Codex-style) marketplace carries no versions, only the plugin set.
codex_mp = load(root / "marketplace.json")
codex_mp_names = set()
if codex_mp is not None:
    codex_mp_names = {e.get("name") for e in codex_mp.get("plugins", [])}

if set(claude_mp_entries) != dir_names:
    errors.append(
        ".claude-plugin/marketplace.json plugin set "
        f"{sorted(claude_mp_entries)} != plugin dirs {sorted(dir_names)}"
    )
if codex_mp_names != dir_names:
    errors.append(
        f"marketplace.json plugin set {sorted(codex_mp_names)} "
        f"!= plugin dirs {sorted(dir_names)}"
    )

FIELDS = ("name", "version", "description")

for pdir in plugin_dirs:
    name = pdir.name
    before = len(errors)  # so "parity ok" only prints when this plugin is clean
    claude = load(pdir / ".claude-plugin" / "plugin.json")
    codex = load(pdir / ".codex-plugin" / "plugin.json")
    if claude is None or codex is None:
        continue

    # claude vs codex plugin.json must agree on the shared fields.
    for field in FIELDS:
        cv, xv = claude.get(field), codex.get(field)
        if cv != xv:
            errors.append(
                f"{name}: .claude-plugin/plugin.json {field}={cv!r} "
                f"!= .codex-plugin/plugin.json {field}={xv!r}"
            )

    # The plugin name must match its directory (and thus its marketplace key).
    if claude.get("name") != name:
        errors.append(
            f"{name}: .claude-plugin/plugin.json name={claude.get('name')!r} "
            f"!= directory name {name!r}"
        )

    # The versioned marketplace entry must agree with the plugin manifest.
    entry = claude_mp_entries.get(name)
    if entry is not None:
        for field in FIELDS:
            mv, pv = entry.get(field), claude.get(field)
            if mv != pv:
                errors.append(
                    f"{name}: .claude-plugin/marketplace.json {field}={mv!r} "
                    f"!= plugin.json {field}={pv!r}"
                )

    if len(errors) == before:
        print(f"parity ok: {name}")

if errors:
    print("\nmanifest parity check FAILED:", file=sys.stderr)
    for e in errors:
        print(f"  - {e}", file=sys.stderr)
    raise SystemExit(1)

print("manifest parity ok")
PY
}

require_json "$ROOT/marketplace.json"
require_json "$ROOT/.claude-plugin/marketplace.json"
require_json "$ROOT/plugins/engineering-practices/.codex-plugin/plugin.json"
require_json "$ROOT/plugins/engineering-practices/.claude-plugin/plugin.json"
require_json "$ROOT/plugins/agent-workflows/.codex-plugin/plugin.json"
require_json "$ROOT/plugins/agent-workflows/.claude-plugin/plugin.json"

check_manifest_parity

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
  # Skipping the external Codex schema validator is acceptable: it lives outside
  # this repo, and check_manifest_parity already asserts claude<->codex field
  # parity (name/version/description) with no external dependency. The validator
  # only adds deeper structural checks of the codex manifest shape.
  echo "skip: codex plugin schema validation (set CODEX_VALIDATOR to validate_plugin.py; manifest parity already enforced)"
fi

find "$ROOT/plugins" -mindepth 3 -maxdepth 3 -type d -path '*/skills/*' -print0 \
  | sort -z \
  | while IFS= read -r -d '' skill_dir; do
      validate_skill "$skill_dir"
    done
