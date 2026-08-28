---
mission_control: 1
mission_id: <stable mission ID>
# Cross-repository campaigns additionally declare:
# mission_source:
#   repository: <repository URL>
#   ref: <immutable or declared ref>
#   path: <path to MISSION.md>
campaign_id: <stable campaign ID>
objective: <one bounded attempt to advance the named mission floors>
status: planned
phase: SPEC
iteration: 0
iteration_budget: <positive numeric cap>
targets:
  - <MISSION-RUBRIC-ID>
attention: none
next_action: <smallest next action>
expected_signal_by: <UTC timestamp; required when waiting>
updated_at: <UTC timestamp>
head: <commit or artifact ref>
review_capacity:
  measure: <repository-specific unit>
  limit: <capacity for this campaign>
evidence: []
---

# Loop: <campaign title> — `<branch>`

Mission: advance [`<mission_id>`](./MISSION.md) targets `<RUBRIC-ID>` through
this one bounded attempt. Drive the campaign to **interior-green** so the only
remaining steps are named human boundaries. Work through the ADF loop
(MISSION → SPEC → PLAN → TDD → DEV → E2E); the verifier decides.

## State (updated <date> — rewrite each iteration; newest facts first)

- Branch `<branch>`, HEAD `<sha>`, tree <clean/dirty>. Nothing pushed.
- <current wall or in-flight work, with evidence pointers>
- <resume-memory or handoff files to read first, if any>

## Decisions (append-only; do not re-litigate)

<!-- dated entries; mark each "ratified (human)" or "provisional (driver)".
     provisional entries carry rationale + consult verdict if one ran -->

1. <date> — <the call>. Why: <rationale>. <ratified|provisional>

## Work plan (ADF per unit)

1. Targets `<RUBRIC-ID>` — <bounded unit and what it establishes now>; defer
   <declared later unit>. Work that targets no rubric ID cites the mission
   invariant or safety requirement that makes it necessary.

## Verification floors

- `missionctl check` → schema, mission link, targets, evidence, and freshness valid.
- <command → what green means; per-change and whole-campaign gates>
- Review gate — harness first, briefed reviews: every review carries the
  mission targets, intended outcome, invariants, acceptance evidence, and
  explicit deferrals. Severity-floor semantics — floor `<severity>`; findings
  at or above it block; max 3 review/fix rounds per reviewed unit. A finding
  the harness should have caught earns a new floor.

## Unblocking ladder

Investigate (two focused passes) → Decisions and doctrine → independent
frontier consult with evidence and candidates → provisional decision → batch
only irreversible, scope-changing, or Boundary items for the human.

## In-session edit policy

The driver edits directly when a fix is finding-sized, mechanical, and fully
understood. After any edit, run the owning gates and include it in the unit's
review scope. Never mix overlapping edits with in-flight work, and never
self-approve.

## Boundaries — NEVER

- Never push, open PRs, merge, or publish without per-artifact authorization.
- Never touch live secrets or biometrics; never reroute around auth failures.
- <repository-specific never>

## Known pre-existing failures — do not chase (cited evidence only)

- <failure → evidence it predates this campaign>

## Terminal states & budget

- **done:** targeted floors have admissible evidence and the interior-green
  checklist holds. Promote durable evidence into `MISSION.md`, then prepare
  the human boundary; campaign done does not imply mission achieved.
- **blocked:** numbered decision batch with evidence and proposed answers.
- **budget-exhausted:** hard cap `<N>`, or three consecutive iterations with
  no movement on any target; raising the cap is the human's.
- **superseded:** name the replacement campaign, promote admissible evidence,
  and start a fresh charter rather than appending another attempt here.
