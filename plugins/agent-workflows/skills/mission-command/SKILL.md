---
name: mission-command
description: Use when authoring or validating a MISSION.md, starting or closing a typed campaign, reviewing mission portfolio attention, ratifying campaign Decisions, or rehearsing commander scenarios.
---

# Mission Command

Use the committed hierarchy `Mission → Campaign → Work unit → Evidence` to
route work and human attention. Activity is not authority: never infer mission
importance or success from sessions, tokens, age, issue count, or code volume.

## Start with declared state

`missionctl` is a separately versioned executable and is not bundled with this
skill. Resolve it from `PATH`; fleet installations use mise. If it is missing,
inspect the committed artifacts directly and state that CLI validation was not
run rather than manufacturing a pass.

Run `missionctl mission` and `missionctl check` when the executable is
available. When a campaign exists, also run `missionctl current` and read its
`LOOP.md`. A missing or malformed source stays visible; do not manufacture an
empty pass. Untyped legacy campaigns stay in the legacy section until
deliberately adopted.

## Author a mission

Choose the finite outcome first, then its kind. Write measurable rubric floors
with stable append-only IDs, a named evaluator, admissible evidence type, and a
freshness window where truth can decay. Record invariants, risks, boundaries,
terminal semantics, and Decisions in the body. Read
[references/schema.md](references/schema.md) for the schema, kind guide, and
evidence rules.

A mission rubric owns strategic success. Link SPEC and BRIEF instead of copying
them: SPEC owns behavioral contracts; BRIEF owns surface quality.

## Run one campaign

One `LOOP.md` is one bounded attempt linked to one mission. Declare the target
rubric IDs, budget, current phase, attention class, next action, expected signal
when waiting, and repository-specific review capacity. Work advancing no target
is out of scope unless a mission invariant or safety requirement names it.

Resume from committed state, not conversational memory. On each iteration,
refresh frontmatter and the journal with evidence pointers. Pointers resolve to
executable machine-readable artifacts or immutable externally owned results;
never create prose evidence sidecars for test output, review narration, or
rollout status. CI, the pull request, and git own that history.

On a terminal state, promote admissible evidence into `MISSION.md`, apply the
`dissolve-docs` skill, and delete the charter after routing any standing law. A
later attempt starts a fresh charter; campaign completion never implies mission
achievement. Research campaigns separately record `confirmed`, `refuted`, or
`inconclusive`.

## Route attention

Use `missionctl portfolio`. Group first by attention, then mission kind:

- `decide` — the unblocking ladder is exhausted and named decisions remain.
- `review` — evidence is ready for a quality or collaboration gate.
- `publish` — interior work is green and a named artifact awaits authorization.
- `watch` — a campaign is waiting for a declared signal.
- `recover` — budget, verifier, stale evidence, or non-convergence is at risk.
- `none` — work is progressing without human attention.

Do not rank unrelated missions. Preserve mission identity and red or stale
rubric IDs.

## Decisions and rehearsal

Ratified mission and Boundary Decisions change only with human confirmation.
Reversible interior calls become dated provisional Decisions; answered human
questions are written once and not re-asked. Use `missionctl drill` to classify
events as interior work, campaign scope, mission amendment, or boundary. Use
`missionctl prompt resume|decision-review|handoff|landing` for canonical
lifecycle prompts rather than maintaining prompt cards in prose.

## Boundary

Publishing, tracked-ref merges, live secrets, biometrics, and genuine unknowns
remain human actions. Local authoring, validation, deterministic rehearsal,
evidence capture, and preparation of canonical prompts remain interior work.
