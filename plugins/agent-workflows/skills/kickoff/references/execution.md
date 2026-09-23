# Structured campaign execution

Use this path when the agreement uses a machine-validated `LOOP.md`. Ordinary
work and lightweight handoffs do not require this state machine.

Read the matching loop, current evidence, and latest agreement. Load
`mission-command` for `missionctl check`, legacy adoption, compaction, and closure.
Missing lifecycle tooling blocks a required lifecycle transition; it does not
prevent independent product work or justify claiming the transition succeeded.

Create a loop from the [template](template.md) only when needed. Its
[fields](../../mission-command/references/schema.md) carry the agreed targets,
checks, and numeric budget. An optional mission manifest is for cross-campaign
coordination, not an additional requirement on every task.

Advance the agreed work. Update states and evidence pointers when they change
or recovery needs them, validate before lifecycle transitions, and honor the
budget. Keep evidence in the native test or task output. During exact-candidate
verification, write live notes outside tracked candidate files; a subsequent
report commit is not a newly verified release artifact.

Stop honestly:

- `done`: requested outcomes and required checks have current evidence.
- `blocked`: identify the missing input or capability and the next safe step.
- `budget-exhausted`: retain unfinished work without increasing the cap; stop
  earlier after three consecutive iterations with no new evidence or progress.
- `superseded`: identify the authorized replacement rather than appending a
  different attempt to the old agreement.

Close completed/superseded attempts through `mission-command`; retain blocked
attempts for recovery. Route durable decisions to maintained docs, not growing
loop history. Cleanup and issue publication still need their own authorization.
The [doctrine](doctrine.md) is a reference for an unresolved campaign decision,
not a compulsory read for every unit.
