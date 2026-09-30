---
name: live-ops
description: Use when operating on live systems - cutovers, migrations, production config changes, or incident triage
---

# Live Ops

The live system is the verifier's final gate: operate on it attended,
deliberately and step by step.

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
- Publish, deploy, and irreversible steps follow "Authority and decisions" in
  `AGENTS.md`: restate the exact action and the grant it relies on first.
