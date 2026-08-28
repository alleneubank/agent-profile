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

## direnv in agent tool calls

Agents run each tool call in a fresh, non-interactive shell. direnv's normal
hook is prompt-driven, so it never fires there and an allowed `.envrc` silently
does not reach the agent — the symptom is a token or a `PATH` entry that is
present in your terminal and absent in the agent's.

This is a shell-configuration problem, not something a plugin should solve. A
hook that rewrites the command to load direnv works, but the rewritten command
then contains `$(...)`, which Claude Code and Codex cannot statically analyse,
so every `Bash(...)` allow rule stops matching and each call needs approval.
Fix the shell instead; the environment then arrives before the tool call is
even matched, and nothing about permissions changes.

Three shells need covering, because each reads a different startup file:

| how the agent spawns its shell | file that runs | harnesses |
|---|---|---|
| non-interactive `zsh` | `~/.zshenv` | Claude Code, Codex |
| `bash -lc` (login) | `~/.bash_profile` | Codex and others |
| `bash -c` (neither login nor interactive) | **`$BASH_ENV` only** | pi |

The third is the one that is easy to miss: plain `bash -c` reads no startup
file at all, so `BASH_ENV` is the only hook that reaches it.

In each file, when the shell is non-interactive, run a one-time
`eval "$(direnv export <shell>)"` instead of installing the prompt hook, and
override `cd`/`pushd`/`popd` to re-export so a mid-command directory change is
picked up. For the `bash -c` case, point `BASH_ENV` at a small loader that does
the same. This repo's companion dotfiles carry a worked implementation in
`shell/.zshenv`, `shell/.bash_profile` and `shell/.direnv-bash-env.sh`.

Two traps worth inheriting from that implementation:

- **Guard against recursion.** `direnv export bash` evaluates the `.envrc` with
  bash, and that bash inherits `BASH_ENV` and sources the loader again. Clear
  it for the call — `eval "$(BASH_ENV= direnv export bash)"` — or the first
  agent tool call in an `.envrc` directory hangs forever.
- **Gate the loader** on an agent marker (`CLAUDECODE`, `CODEX_THREAD_ID`,
  `PI_CODING_AGENT`) and on an `.envrc` actually being in scope, found with a
  pure-builtin walk up the tree. `BASH_ENV` is read by *every* non-interactive
  bash on the machine, so without both gates every shell script on the system
  pays for a direnv fork.

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

## Typed mission command

The `mission-command` skill consumes the separately versioned `missionctl`
executable from `PATH`; agent-profile does not vendor or release that tool or
register its lifecycle hooks. Fleet installations manage the executable
through mise and install the hooks-only plugin from
`github:alleneubank/missionctl`.

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
