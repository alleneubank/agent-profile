---
name: kickoff
description: Use when the user wants to start or resume an unattended campaign on the current branch from a seed (LANE.md, LOOP.md, or the branch's issue) with an iteration budget, or asks to see the kickoff prompt without running it.
---

# Kickoff

The baked unattended-campaign prompt, parameterized. It composes `afk`
(presence constraint), `loop-brief` (authoring, iteration protocol, terminal
states), and `sitrep` (the terminal report); load them rather than
re-deriving what they mandate.

## Arguments

Parsed from the text following the skill invocation.

- **seed** — where `LOOP.md` is authored from. Default: `LANE.md` at the
  repo root when present, else the branch's issue on the forge. An existing
  `LOOP.md` is resumed per `loop-brief`, never re-seeded.
- **budget** — the numeric `iteration_budget`. Default: the value an existing
  `LOOP.md` declares. With neither, ask once before starting — the kickoff
  moment is attended even though the campaign is not.
- **`--dry-run`** — print the prompt that would run, fully substituted, and
  stop. No `LOOP.md` is created, no file is edited, no skill is loaded.

## The prompt

```
Unattended. Seed LOOP.md from <seed>; set an iteration budget of <n>.
Load code-law and testing-best-practices before writing code or tests.
Stop at the Boundary: no push, PR, merge, or issue close.
On any terminal state (done, blocked, budget-exhausted, superseded) follow
loop-brief's terminal write-back: settle the loop, clean up what the
campaign started, save non-obvious findings to memory, then write the
sitrep to ~/.handoffs/sitrep-<repo>-<branch>-<date>.md and print it.
```

Without `--dry-run`, substitute the arguments and act on the prompt as the
campaign's operation order in this session: load `afk` and `loop-brief`,
author or resume `LOOP.md`, and run iterations until a terminal state.

## Red flags

- Starting the loop when `--dry-run` was given.
- Inventing a seed when neither `LANE.md` nor a branch issue exists — that
  is a `blocked` before iteration 1, reported in the sitrep.
- A terminal reached with no sitrep file: an unattended campaign's only
  output is what survives the session.
