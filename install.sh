#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="check"
REPLACE_EXISTING=0

usage() {
  cat <<'EOF'
Usage: ./install.sh [--check|--fix] [--replace-existing]

  --check             Report instruction and marketplace state. Default.
  --fix               Link instruction files and register marketplaces for installed CLIs.
  --replace-existing  Backup and replace non-symlink instruction files.

Exit 0 when every applicable target is in place. A missing codex or claude
CLI is skipped. jq is required only to inspect a CLI that is installed.
A failed link, a failed marketplace add, or a Codex config in another git
worktree still fails the run.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --check) MODE="check" ;;
    --fix) MODE="fix" ;;
    --replace-existing) REPLACE_EXISTING=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

SOURCE="$ROOT/AGENTS.md"
CODEX_TARGET="$HOME/.codex/AGENTS.md"
CLAUDE_TARGET="$HOME/.claude/CLAUDE.md"
AGY_TARGET="$HOME/.gemini/config/AGENTS.md"
AGY_PLUGINS_JSON="${AGY_PLUGINS_JSON:-$HOME/.gemini/config/plugins.json}"
MARKETPLACE_NAME="agent-profile"
CODEX_CONFIG="${CODEX_CONFIG:-$HOME/.codex/config.toml}"

status=0

check_target() {
  local label="$1"
  local target="$2"

  if [ -L "$target" ] && [ "$(readlink "$target")" = "$SOURCE" ]; then
    echo "ok: $label -> $SOURCE"
    return 0
  fi

  if [ -L "$target" ]; then
    echo "drift: $label is symlink to $(readlink "$target")"
    return 1
  fi

  if [ -e "$target" ]; then
    echo "blocked: $label exists and is not a symlink: $target"
    return 1
  fi

  echo "missing: $label target does not exist: $target"
  return 1
}

fix_target() {
  local label="$1"
  local target="$2"
  local parent
  parent="$(dirname "$target")"
  # Callers invoke this as `cmd || status=1`, which turns off -e for the whole
  # function, so a failed command must return before any success line.
  if ! mkdir -p "$parent"; then
    echo "failed: could not create $parent" >&2
    return 1
  fi

  if [ -L "$target" ] && [ "$(readlink "$target")" = "$SOURCE" ]; then
    echo "ok: $label -> $SOURCE"
    return 0
  fi

  if [ -e "$target" ] && [ ! -L "$target" ]; then
    if [ "$REPLACE_EXISTING" -ne 1 ]; then
      echo "blocked: $label exists and is not a symlink; rerun with --replace-existing to back it up" >&2
      return 1
    fi
    if [ -d "$target" ]; then
      echo "blocked: refusing to replace directory target: $target" >&2
      return 1
    fi
    local backup="$target.backup.$(date +%Y%m%d-%H%M%S)"
    if ! mv "$target" "$backup"; then
      echo "failed: could not back up $target" >&2
      return 1
    fi
    echo "backup: moved $target to $backup"
  fi

  if ! ln -sfn "$SOURCE" "$target"; then
    echo "failed: could not link $label -> $SOURCE" >&2
    return 1
  fi
  echo "fixed: $label -> $SOURCE"
}

# jq only parses marketplace JSON. Skip a missing CLI before asking for it.
codex_marketplace_ok() {
  command -v codex >/dev/null 2>&1 || return 5
  command -v jq >/dev/null 2>&1 || return 2
  if codex_config_is_external_git_worktree; then
    return 3
  fi
  codex plugin marketplace list --json \
    | jq -e --arg name "$MARKETPLACE_NAME" --arg root "$ROOT" \
        '.marketplaces[]? | select(.name == $name and .root == $root)' >/dev/null
}

codex_config_is_external_git_worktree() {
  local resolved config_dir worktree
  [ -e "$CODEX_CONFIG" ] || return 1
  resolved="$(realpath "$CODEX_CONFIG")"
  config_dir="$(dirname "$resolved")"
  worktree="$(git -C "$config_dir" rev-parse --show-toplevel 2>/dev/null || true)"
  [ -n "$worktree" ] && [ "$worktree" != "$ROOT" ]
}

claude_marketplace_ok() {
  command -v claude >/dev/null 2>&1 || return 5
  command -v jq >/dev/null 2>&1 || return 2
  claude plugin marketplace list --json \
    | jq -e --arg name "$MARKETPLACE_NAME" --arg root "$ROOT" \
        '.[]? | select(.name == $name and ((.path? == $root) or (.installLocation? == $root)))' >/dev/null
}

check_marketplace() {
  local label="$1"
  local fn="$2"
  local rc=0

  # An if whose condition is false and whose body does not run reports 0,
  # so the checker status has to be saved on this line.
  "$fn" || rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "ok: $label marketplace registered"
    return 0
  fi
  if [ "$rc" -eq 5 ]; then
    echo "skipped: $label CLI is not installed"
    return 0
  fi
  if [ "$rc" -eq 2 ]; then
    echo "missing-tool: cannot check $label marketplace; requires jq"
    return 1
  fi
  if [ "$rc" -eq 3 ]; then
    echo "blocked: $label marketplace config resolves inside another git worktree: $(realpath "$CODEX_CONFIG")"
  else
    echo "missing: $label marketplace is not registered"
  fi
  return 1
}

fix_marketplace() {
  local label="$1"
  local check_fn="$2"
  local rc=0
  shift 2

  # Same status capture as check_marketplace: $? after a skipped if is 0.
  "$check_fn" || rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "ok: $label marketplace registered"
    return 0
  fi
  if [ "$rc" -eq 5 ]; then
    echo "skipped: $label CLI is not installed"
    return 0
  fi
  if [ "$rc" -eq 2 ]; then
    echo "blocked: cannot register $label marketplace; requires jq" >&2
    return 1
  fi
  if [ "$rc" -eq 3 ]; then
    echo "blocked: refusing to modify $label marketplace config in another git worktree: $(realpath "$CODEX_CONFIG")" >&2
    return 1
  fi

  if "$@"; then
    echo "fixed: registered $label marketplace"
    return 0
  fi
  echo "failed: could not register $label marketplace" >&2
  return 1
}

cursor_present() {
  [ -n "${CURSOR_AGENT:-}" ] || [ -d "$HOME/.cursor" ]
}

link_one_cursor_skills() {
  local name="$1"
  local source="$2"
  local target="$HOME/.cursor/skills/$name"

  if [ -L "$target" ] && [ "$(readlink "$target")" = "$source" ]; then
    echo "ok: Cursor skills $name -> $source"
    return 0
  fi
  if [ -e "$target" ] && [ ! -L "$target" ]; then
    echo "blocked: Cursor skills $name exists and is not a symlink: $target" >&2
    return 1
  fi
  if [ "$MODE" = "check" ]; then
    if [ -L "$target" ]; then
      echo "drift: Cursor skills $name is symlink to $(readlink "$target")"
    else
      echo "missing: Cursor skills $name"
    fi
    return 1
  fi
  if ! ln -sfn "$source" "$target"; then
    echo "failed: could not link Cursor skills $name -> $source" >&2
    return 1
  fi
  echo "fixed: Cursor skills $name -> $source"
}

link_cursor_skills() {
  local dest="$HOME/.cursor/skills"
  local rc=0
  if [ "$MODE" = "fix" ]; then
    if ! mkdir -p "$dest"; then
      echo "failed: could not create $dest" >&2
      return 1
    fi
  fi
  link_one_cursor_skills "agent-workflows" "$ROOT/plugins/agent-workflows/skills" || rc=1
  link_one_cursor_skills "engineering-practices" "$ROOT/plugins/engineering-practices/skills" || rc=1
  return "$rc"
}

report_cursor() {
  if ! cursor_present; then
    echo "skipped: Cursor not detected"
    return 0
  fi

  echo "cursor: AGENTS.md is $SOURCE. Read it and follow it. Do not copy it into a repository."
  echo "cursor: skills are in $ROOT/plugins/agent-workflows/skills and $ROOT/plugins/engineering-practices/skills. Load the skill whose description matches the next action before that action."
  echo "cursor: User Rules live in Cursor Settings, not in a file this installer can write."

  # Cloud agents already started with their skill index. Sync copies
  # ~/.cursor/skills from the local machine; a directory written here is not that.
  if [ -n "${CURSOR_AGENT:-}" ]; then
    echo "cursor: Cloud Agents do not load skills written on this VM. Sync Skills for Cloud Agents copies ~/.cursor/skills from the local machine. Follow the paths above in this session."
    return 0
  fi

  link_cursor_skills
}

agy_plugins_manage() {
  local action="$1"
  if ! command -v agy >/dev/null 2>&1; then
    echo "skipped: agy CLI is not installed"
    return 0
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    if [ "$action" = "check" ]; then
      echo "missing-tool: cannot check agy plugins.json; requires python3"
    else
      echo "blocked: cannot register agy plugins.json; requires python3" >&2
    fi
    return 1
  fi
  python3 - "$action" "$AGY_PLUGINS_JSON" "$ROOT/plugins" <<'PY'
import json
import os
import pathlib
import sys
import tempfile

action, cfg_arg, plugins_dir = sys.argv[1], sys.argv[2], sys.argv[3]
cfg_path = pathlib.Path(cfg_arg)

if cfg_path.is_symlink():
    print(f"blocked: agy plugins.json is a symlink: {cfg_path}", file=sys.stderr)
    raise SystemExit(1)

if cfg_path.exists():
    try:
        data = json.loads(cfg_path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"blocked: agy plugins.json is invalid JSON ({cfg_path}): {exc}", file=sys.stderr)
        raise SystemExit(1)
    if not isinstance(data, dict):
        print(f"blocked: agy plugins.json must be a JSON object: {cfg_path}", file=sys.stderr)
        raise SystemExit(1)
else:
    data = None

entries = data.get("entries") if isinstance(data, dict) else None
if entries is not None and not isinstance(entries, list):
    print(f"blocked: agy plugins.json entries must be a list: {cfg_path}", file=sys.stderr)
    raise SystemExit(1)

present = any(isinstance(item, dict) and item.get("path") == plugins_dir for item in (entries or []))
if present:
    print(f"ok: agy plugins registered ({plugins_dir})")
    raise SystemExit(0)

if action == "check":
    if data is None:
        print(f"missing: agy plugins.json does not exist: {cfg_path}")
    else:
        print(f"missing: agy plugins.json does not include {plugins_dir}")
    raise SystemExit(1)

merged = dict(data) if data is not None else {}
merged_entries = list(entries) if entries is not None else []
merged_entries.append({"path": plugins_dir})
merged["entries"] = merged_entries

cfg_path.parent.mkdir(parents=True, exist_ok=True)
fd, tmp_name = tempfile.mkstemp(prefix=f".{cfg_path.name}.", dir=cfg_path.parent)
tmp_path = pathlib.Path(tmp_name)
try:
    with os.fdopen(fd, "w", encoding="utf-8", newline="") as handle:
        handle.write(json.dumps(merged, indent=2, ensure_ascii=False) + "\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.chmod(tmp_path, 0o644)
    os.replace(tmp_path, cfg_path)
except Exception:
    tmp_path.unlink(missing_ok=True)
    raise

print(f"fixed: registered agy plugins ({plugins_dir})")
PY
}

if [ "$MODE" = "check" ]; then
  check_target "Codex instructions" "$CODEX_TARGET" || status=1
  check_target "Claude instructions" "$CLAUDE_TARGET" || status=1
  check_target "Antigravity instructions" "$AGY_TARGET" || status=1
  check_marketplace "codex" codex_marketplace_ok || status=1
  check_marketplace "claude" claude_marketplace_ok || status=1
  agy_plugins_manage check || status=1
  report_cursor || status=1
  exit "$status"
fi

fix_target "Codex instructions" "$CODEX_TARGET" || status=1
fix_target "Claude instructions" "$CLAUDE_TARGET" || status=1
fix_target "Antigravity instructions" "$AGY_TARGET" || status=1
fix_marketplace "codex" codex_marketplace_ok codex plugin marketplace add "$ROOT" || status=1
fix_marketplace "claude" claude_marketplace_ok claude plugin marketplace add "$ROOT" || status=1
agy_plugins_manage fix || status=1
report_cursor || status=1
exit "$status"
