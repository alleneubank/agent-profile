---
name: live-ops
description: Use when operating on live systems - cutovers, migrations, production config changes, or incident triage
---

# Live Ops

Live systems are the final gate. Operations against them are attended,
human-supervised work — never autonomous-loop work. Loops verify against a
deterministic proxy; a live system is touched deliberately, step by step.

## Access floor (before any cutover)

Before starting a cutover, migration, or production change, verify — not
assume — access to every system the operation and its failure modes need:

- **Triage access**: logs, metrics, and consoles for every environment
  involved, each proven with a real read.
- **Rollback access**: the credentials and tooling the rollback path needs,
  exercised far enough to prove they work.
- Any failed access check means the operation has not started — fix access
  first. Discovering a blind environment mid-cutover converts a routine
  change into an incident.

## During the operation

- One change at a time; verify each step's effect before the next.
- Know the abort criteria before starting, so the rollback decision stays
  cheap under pressure.
- Publish, deploy, and irreversible steps remain the human's call — restate
  the concrete artifact about to change before acting.
