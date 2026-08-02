# Loop: <mission title> — `<branch>`

Mission: drive this branch to **interior-green** so the only remaining steps
are the human's boundary calls (<attended gates, push, merge proposal>).
Work through the ADF loop (SPEC → PLAN → TDD → DEV → E2E). Unblock via the
ladder; the verifier — not confidence — decides when work is done.

## State (updated <date> — rewrite each iteration; newest facts first)

- Branch `<branch>`, HEAD `<sha>`, tree <clean/dirty>. Nothing pushed.
- <current wall / in-flight work, with evidence pointers>
- <resume-memory or handoff files to read first, if any>

## Decisions (append-only; do not re-litigate)

<!-- dated entries; mark each "ratified (human)" or "provisional (driver)".
     provisional entries carry rationale + consult verdict if one ran -->

1. <date> — <the call>. Why: <rationale>. <ratified|provisional>

## Work plan (ADF per unit)

1. <ordered, bounded units toward interior-green; each unit names what it
   establishes now and what it explicitly defers to a later unit — that
   pairing is the review contract>

## Verification floors

- <command → what green means; per-change and whole-branch gates>
- Review gate — harness first, briefed reviews: the driver and cooks own
  verification; do not outsource to a reviewer what a floor can decide.
  Every review carries its unit's contract — intended outcome, what to
  judge now, invariants, acceptance evidence, and work explicitly deferred
  to a later unit; declared deferred work is not a finding, current-unit
  regressions and contract violations are. Severity-floor semantics — floor
  `<severity, in the reviewer's own scale — e.g. major>`: findings at or
  above it block, a below-floor-only reject does not; max 3 review→fixup
  rounds per reviewed unit. A finding the harness should have caught earns
  a new floor, not just a patch.

## Unblocking ladder

Investigate (two focused passes) → doctrine (Decisions here, BRIEF/SPEC
Decisions, `doctrine.md` in the loop-brief skill, memory) → `rl consult`
with evidence + candidate approaches + spec excerpts → provisional decision
(dated entry above) → accumulate for the human (irreversible /
scope-changing / Boundary items only).

## In-session edit policy

The driver edits directly when the fix is finding-sized (≤ ~2 files,
mechanical, fully understood). After any in-session edit: run the owning
gates and commit conventionally — the edit lands in its unit's review
scope; the driver never self-approves. Larger or design-shaped work goes to a cook
packet. Never mix in-session edits with an in-flight worker on the same
files.

## Boundaries — NEVER

- Never push, open PRs, or merge — publish is the human's, per-artifact.
- Never touch live secrets or biometrics; never reroute around auth
  failures — surface and stop.
- <repo-specific nevers>

## Known pre-existing failures — do not chase (cited evidence only)

- <failure → evidence it predates this branch>

## Terminal states & budget

- **done:** <interior-green checklist>. Then stop the loop, update State,
  and write the handoff for the human's boundary steps.
- **blocked:** numbered decision batch, each with evidence + a proposed
  answer; keep working independent items until only the batch remains.
- **budget:** hard cap `<N>` iterations for the campaign (numeric, set at
  authoring; raising it is the human's) — or, earlier, three consecutive
  iterations without measurable movement on any checklist item → stop
  honestly with what was tried and why it cannot converge.
