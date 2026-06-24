#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CODEX_VALIDATOR="/home/ae/dotfiles/codex/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py"
SKILL_VALIDATOR="/home/ae/dotfiles/codex/.codex/skills/.system/skill-creator/scripts/quick_validate.py"

run_python_validator() {
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

  echo "PyYAML is required for validator scripts; install it or install uv." >&2
  return 1
}

run_python_validator "$CODEX_VALIDATOR" "$ROOT/plugins/engineering-practices"
run_python_validator "$CODEX_VALIDATOR" "$ROOT/plugins/agent-workflows"

claude plugin validate --strict "$ROOT/.claude-plugin/marketplace.json"
claude plugin validate --strict "$ROOT/plugins/engineering-practices"
claude plugin validate --strict "$ROOT/plugins/agent-workflows"

find "$ROOT/plugins" -mindepth 3 -maxdepth 3 -type d -path '*/skills/*' -print0 \
  | sort -z \
  | while IFS= read -r -d '' skill_dir; do
      run_python_validator "$SKILL_VALIDATOR" "$skill_dir"
    done
