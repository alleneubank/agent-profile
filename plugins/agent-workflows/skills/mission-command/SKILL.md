---
name: mission-command
description: Use when a campaign LOOP.md needs to be checked, compacted, or closed through missionctl, when a legacy loop must be inspected or adopted, or when an outcome spans campaigns or repositories and earns an optional .mission/mission.yaml.
---

# Mission Command

Route work and human attention through committed contracts: one compact
`LOOP.md` per campaign, targets into `SPEC.md` requirements and `BRIEF.md`
floors, and — only when an outcome genuinely spans campaigns or
repositories — one `.mission/mission.yaml`. Activity is not authority: never
infer importance or success from sessions, tokens, age, issue count, or code
volume.

## Start with declared state

`missionctl` is a separately versioned executable resolved from `PATH` (fleet
installs use mise). If it is missing, read the artifacts directly and say that
CLI validation was not run rather than manufacturing a pass.

- `missionctl check` — validates the loop at or above the working directory;
  every issue carries a stable code, severity, path, and repair hint. Warnings
  never fail; errors do.
- `missionctl context` — the bounded working set: objective, current unit, red
  gates, decisions, blockers, boundary, mission link. This is what a fresh
  session or hook receives; the loop body is not injected.
- `missionctl inspect` — classifies `loop`, `legacy-untyped`,
  `legacy-mission-control`, or `none`. A legacy loop is adopted deliberately,
  never silently treated as comparable.
- `missionctl mission` — projects the optional mission and the campaigns that
  link to it.

Invalid state stays visible: `context` refuses an invalid loop, `statusline`
prints the degradation, the session-start hook names the issue count. Repair
the loop (`missionctl repair` for mechanical canonicalization, hand edits for
meaning) before continuing.

## One campaign, one loop

Authoring and iterating a loop is the `loop-brief` skill. The contract is in
[references/schema.md](references/schema.md): frontmatter is the machine
contract, the body is working notes. Direct edits are supported like edits to
`Cargo.toml`; missionctl is not an exclusive generator.

## Compact at milestones

When a unit lands, decisions accumulate, or the body grows, shrink the loop
without losing anything the driver has not explicitly let go:

```bash
missionctl compact prepare --json > plan.json   # done units, decisions, blockers, body sections
# set "disposition" on every item; add "reason" where required
missionctl compact validate --plan plan.json
missionctl compact apply    --plan plan.json
```

Dispositions carry meaning and are the driver's: `keep`, `drop` (reason
required for decisions and blockers), `route:spec` / `route:brief` (appends a
dated entry to that document's `## Decisions`), `migrated` (the driver moved
the section's content by hand). Unresolved units are never listed and always
retained. Never fill dispositions from `proposed` without reading each item;
the proposal is a hint, not a judgment. A stale or incomplete plan is refused;
prepare again after any edit.

## Close at a terminal

A loop closes only from `done` (every gate green), `budget-exhausted`, or
`superseded`. `close prepare` lists every unit not done (`complete` | `drop`),
every decision (`route:spec` | `route:brief` | `drop`), every blocker, every
body section (`drop` | `migrated`), and — when a mission is linked — each
targeted rubric item (`met` with evidence, `open`, `waived` with reason).
`close apply` routes, updates the mission, and deletes `LOOP.md`. Git is the
archive: no copy, no ledger, no sidecar. A later attempt starts a fresh loop.

## Declare a mission only when earned

Create `.mission/mission.yaml` when the outcome is multi-campaign, unattended
multi-phase, or cross-repository. Its rubric items are the enduring floors
campaigns advance through `targets.mission`; their `status` moves through
`close` dispositions, and `evidence` is a reference into the native verifier,
CI, review, or release system — never a narrative. A cross-repository loop
links by `mission.source` (repository, ref, path), resolved from a sibling
checkout of that repository; an absent sibling is a visible warning, not a
silent pass. Ordinary one-branch work declares no
mission.

## Boundary

Publishing, tracked-ref merges, release tags, live secrets, biometrics, and
genuine unknowns remain human actions. Local validation, projection,
compaction, closure, and adoption remain interior work.
