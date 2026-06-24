# agent-profile

Portable agent runtime profile for Codex CLI and Claude Code.

This repo owns one public, shareable instruction file and a small marketplace of
installable plugins. It replaces ad hoc dotfile sync for agent instructions and
skills without taking ownership of private local overrides.

## What This Owns

- `AGENTS.md` is the canonical shared user-level instruction file.
- `~/.codex/AGENTS.md` should be a symlink to `AGENTS.md`.
- `~/.claude/CLAUDE.md` should be a symlink to `AGENTS.md`.
- `plugins/engineering-practices` contains language, tooling, and quality skills.
- `plugins/agent-workflows` contains reusable workflow skills.

Private notes do not belong in this repo. Use `~/.codex/AGENTS.override.md`,
`~/.claude/CLAUDE.local.md`, or another local-only file outside this repository.

## Install

Clone the profile repo from GitHub:

```bash
git clone https://github.com/alleneubank/agent-profile.git ~/.agent-profile
cd ~/.agent-profile
```

Check current runtime state:

```bash
./install.sh --check
```

Apply safe fixes:

```bash
./install.sh --fix
```

If an instruction target is a real file instead of a symlink, the installer
refuses to replace it. To back it up and replace it with the repo symlink:

```bash
./install.sh --fix --replace-existing
```

## Marketplace Commands

The installer registers local marketplaces during `--fix` only when doing so will
not mutate a config file owned by another git worktree. Manual marketplace
commands are useful when installing directly from GitHub or when you want plugin
installation separate from instruction-file setup.

Install plugins from GitHub:

```bash
codex plugin marketplace add alleneubank/agent-profile
codex plugin add engineering-practices@agent-profile
codex plugin add agent-workflows@agent-profile

claude plugin marketplace add alleneubank/agent-profile
claude plugin install engineering-practices@agent-profile
claude plugin install agent-workflows@agent-profile
```

## Validation

```bash
./scripts/validate.sh
```

The old `codex-reviewer` and `ralph-reviewed` Claude hook plugins are retired.
Use modern `rl` skills and commands for review gates and autonomous loops.
