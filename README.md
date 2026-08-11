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

## Pi package

This repo is also an installable [pi](https://pi.dev) package. It provides both
plugins' skills (Agent Skills standard — pi's skill loader accepts Claude Code
skill frontmatter) plus pi-native equivalents of the plugins' Claude/Codex
hooks:

- **Instruction fingerprint** — on `session_start`, pi emits the
  `instruction-fingerprint` custom message so sessions stay bucketable by
  instruction version (eval A/B input).
- **Verifier-bypass guard** — on `tool_call` (bash), commands matching the
guard policy (`git --no-verify`, `core.hooksPath=/dev/null`) are blocked
with the policy's reason; `HOOK_BYPASS_APPROVED=1` remains the escape hatch.

```bash
pi install git:git@github.com:alleneubank/agent-profile.git
```

Hook policy has a single source of truth: the pi extension execs the canonical
scripts in `plugins/agent-workflows/hooks/` with the same stdin/JSON contract
Claude and Codex use — no inline duplicate, and `scripts/validate.sh` fails the
build if the extension stops referencing them. `SubagentStart` has no pi
analogue (pi has no native subagents) and is a documented skip. Hooks fail
open: script errors and timeouts never block a tool call or session start.

Develop and verify:

```bash
npm install
npm run check          # tsc --noEmit + vitest
./scripts/validate.sh  # parity + skill + pi package gates
pi -e extensions/pi-hooks.ts   # load the extension without installing
```

The root `package.json` version is independent of the per-plugin manifest
versions managed under Releasing below.

## Validation

```bash
./scripts/validate.sh
```

The old `codex-reviewer` and `ralph-reviewed` Claude hook plugins are retired.
Use modern `rl` skills and commands for review gates and autonomous loops.

## Releasing

Each plugin is versioned independently; the `version` field in its manifest is the
single source of truth. `scripts/validate.sh` enforces 3-way parity across
`plugins/<name>/.claude-plugin/plugin.json`, `plugins/<name>/.codex-plugin/plugin.json`,
and the plugin's entry in `.claude-plugin/marketplace.json` — `name`/`version`/`description`
must match. The root `marketplace.json` (Codex-style) carries no versions.

Semver, per plugin:

- `MAJOR` — breaking change to a skill's contract (a skill removed/renamed, or its
  invocation/behavior changed in a way callers depend on).
- `MINOR` — a new skill, or a new backward-compatible capability/section.
- `PATCH` — clarifications, fixes, or wording changes to existing guidance.

Release steps:

1. Bump `version` in all three manifests for the plugin (keep them identical).
2. Commit: `chore(release): <plugin> vX.Y.Z`.
3. Tag the release commit, namespaced per plugin:
   `git tag -a <plugin>-vX.Y.Z -m "<plugin> vX.Y.Z — <summary>"`.
4. Push commits and the tag, then bump the submodule pin in the consuming superproject.

Tags mirror the manifest version and are human-facing markers only — plugins install by
name from the marketplace (`claude plugin install <plugin>@agent-profile`), which reads the
manifest, not git tags. The legacy unscoped `v1.1.0` tag predates this scheme.
