# agent-profile

My agent garden: the instructions and skills my coding agents work by, in
Claude Code, Codex CLI and pi. I tend it as I go, pulling what stops paying
its way and planting what a real task showed was missing, so it should get a
little better each time I put work into it.

## What grows here

- **[`AGENTS.md`](AGENTS.md)**: the one instruction file every agent reads,
  covering scope, verification, authority, secrets and operations. It is
  short on purpose: a validator caps it at 1,434 words.
- **[`agent-workflows`](plugins/agent-workflows/skills/)**: how work moves.
  `done` defines finished as merged with an evidence record and hands a
  guest, a design reviewer or a specialist their charter; `onboard` sets a
  repository up for that loop; `coordinator` runs many agent lanes under one
  charter; plus `tee-up`, `handoff`, `sitrep`, `papercuts` and others.
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
./install.sh --fix     # link AGENTS.md for Claude Code and Codex, register the plugins
```

The installer refuses to replace a real instruction file;
`./install.sh --fix --replace-existing` backs it up first. To take only the
plugins:

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
