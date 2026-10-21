# agent-profile

My agent garden: the instructions and skills my coding agents work by, in
Claude Code, Codex CLI, pi, and Cursor. I tend it as I go, pulling what stops
paying its way and planting what a real task showed was missing, so it should
get a little better each time I put work into it.

## What grows here

- **[`AGENTS.md`](AGENTS.md)**: the one instruction file every agent reads,
  covering scope, verification, authority, secrets and operations. It is
  short on purpose: a validator caps it at 1,495 words.
- **[`agent-workflows`](plugins/agent-workflows/skills/)**: how work moves.
  `done` defines finished as merged with an evidence record and hands a
  guest, a design reviewer or a specialist their charter; `onboard` sets a
  repository up for that loop; `coordinator` runs many agent lanes under one
  charter; `design` takes a surface from flow to spec before it is built;
  plus `tee-up`, `handoff`, `sitrep`, `papercuts` and others.
- **[`engineering-practices`](plugins/engineering-practices/skills/)**: how
  code gets written: `code-law`, testing, git and pull requests, and
  per-language and per-tool guides.

Each change is a small experiment. Its source, prediction and outcome are
recorded before it ships, and a rule that stops earning its place is removed.
Private notes stay out of this repository: use `~/.codex/AGENTS.override.md`
or `~/.claude/CLAUDE.local.md`.

## Install

```bash
git clone https://github.com/alleneubank/agent-profile.git ~/.agent-profile
cd ~/.agent-profile
./install.sh --check   # see what would change
./install.sh --fix     # link what applies, then follow the Cursor lines
```

`./install.sh --fix` links `AGENTS.md` for Claude Code and Codex. When `codex`
or `claude` is installed it registers that marketplace; when the CLI is
absent it prints `skipped:` with the CLI's name, does not run it, and still
exits 0 once every applicable target is in place. `jq` is required only to
read a marketplace listing for a CLI that is installed. The installer refuses
to replace a real instruction file; `./install.sh --fix --replace-existing`
backs one up first.

Cursor does not load `~/.codex` or `~/.claude`. User Rules are Cursor Settings,
not a file this installer can write, and Cursor reads `AGENTS.md` from the
project, not from home. The installer does not copy `AGENTS.md` into a
repository. It prints this checkout's `AGENTS.md` path and the two skill
directories; read those and load a skill before the action its description
names. On a local IDE (`~/.cursor` exists and `CURSOR_AGENT` is unset) it also
symlinks the skill trees into `~/.cursor/skills` for later sessions. A Cursor
agent (`CURSOR_AGENT` set) does not get those symlinks: Cloud Agents receive
`~/.cursor/skills` only when Sync Skills for Cloud Agents copies them from
the local machine.

To take only the plugins:

```bash
claude plugin marketplace add alleneubank/agent-profile
claude plugin install agent-workflows@agent-profile
claude plugin install engineering-practices@agent-profile

codex plugin marketplace add alleneubank/agent-profile
codex plugin add agent-workflows@agent-profile
codex plugin add engineering-practices@agent-profile
```

For [pi](https://pi.dev), the repository is a package that carries both
plugins' skills and pi-native versions of their hooks:

```bash
pi install git:git@github.com:alleneubank/agent-profile.git
```

## Tending it

```bash
npm install
npm run check            # typecheck and tests
./scripts/validate.sh    # manifests, skills, instruction budget, release tags
pi -e extensions/pi-hooks.ts   # try the pi hooks without installing
```

- [SPEC.md](SPEC.md) records requirements and dated decisions.
- [docs/releasing.md](docs/releasing.md) covers versioning and tags; each
  plugin is versioned on its own.
- [docs/direnv.md](docs/direnv.md) explains how to make `.envrc` reach agent
  tool calls.
- The [engineering wiki](https://github.com/alleneubank/eng-wiki) explains the
  reasoning behind the practices; nothing here depends on it at runtime.
