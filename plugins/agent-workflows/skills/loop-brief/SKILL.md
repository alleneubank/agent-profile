---
name: loop-brief
description: Use when a feature branch or campaign needs an autonomous multi-session loop — the user asks for a LOOP.md or a self-driving plan to finish a branch, says they are stepping away with work in flight, or a session must run or resume a campaign that has a LOOP.md (legacy path .claude/loop.md).
---

# Loop Brief

`LOOP.md` is exactly one campaign: one bounded attempt's operation order and
working memory in one committed file. Its YAML frontmatter is the machine
contract — objective, status, phase, budget, targets, gates, units,
decisions, blockers, boundary — that `missionctl` validates and projects; its
Markdown body is working notes the driver owns. The law half (unblocking
ladder, edit policy, budgets, boundaries) lives in this skill and the
doctrine, not in the file, so the file stays small enough to read every
iteration. It targets `SPEC.md` requirements and `BRIEF.md` floors directly;
it links a `.mission/mission.yaml` only when the outcome spans campaigns or
repositories (mission-command skill). Like SPEC and BRIEF it is
**colocated** with the work and **committed with it**, so any host, harness,
or fresh session resumes from git alone. It is branch-scoped and disposable:
taste that outlives the branch routes to BRIEF/SPEC Decisions through
`compact`/`close`; git is the archive. A successive attempt starts a fresh
loop; it never appends to a closed one.

## Invocation

Harness-agnostic by design: any driver that can read the repo can run an
iteration — an interval scheduler, a cron'd headless run, a detached
worker, or a human-started session told to continue the campaign.

- `LOOP.md` absent → author one (below), restate its objective and targets
  for confirmation if the user is present, then run iteration 1.
- `LOOP.md` present → `missionctl check`, then run one iteration per the
  protocol. An invalid loop is repaired before work continues; never work
  around a validation error by ignoring it.
- `missionctl inspect` reports `legacy-untyped` or `legacy-mission-control`
  → `missionctl adopt --write`, review the draft, then proceed. Legacy loops
  are adopted deliberately, never treated as comparable.

## Authoring

Copy `template.md` (colocated with this skill) and fill the frontmatter;
[schema.md](../mission-command/references/schema.md) is the field reference.
Crystallize from what already exists: `targets.spec` from the nearest
`SPEC.md` `REQ-*` ids and `targets.brief` from the nearest `BRIEF.md` floor
names; gates from the repo harness (discovery order: task runner → repo
docs → project defaults), each with a `run` command and a `green` meaning;
boundaries from repo instructions plus the profile's Boundary law; known
pre-existing failures only with cited evidence — never as a place to park
new breakage. A wrong target compounds every iteration; `missionctl check`
refuses unresolved ones. Set a numeric `iteration_budget` at authoring. When an
operable surface needs experiential verification, declare a bug-bash gate with
its artifact, environment, task or time budget, and severity floor; load the
`bugbash` skill for its mechanics. The ADF high-risk classes receive a matching,
bounded specialist-review gate unless the human records a PLAN waiver with
faithful alternative evidence; other classes add one only for a named risk that
execution cannot decide. Run objective gates first, selected specialist review
next, and the terminal bug bash on the resulting artifact last.

## Iteration protocol

1. `missionctl context` (bounded working set), then read `LOOP.md` top to
   bottom. Declared state and Decisions override stale memory.
2. Restate the `current` unit as a self-contained achievable goal — the
   contract the iteration runs against — then execute it through the ADF
   gates the unit's phase names.
3. Run the gates; record each observed `state`. The verifier decides, not
   confidence.
4. Blocked? Climb the ladder (below). Never freeze on question #1.
5. Write back: unit states, `iteration`, `phase`, `updated_at`, provisional
   decisions, blockers, and State notes (facts learned, walls hit or
   cleared, evidence pointers, commit SHAs). `missionctl check`, then commit
   the loop with the work. An iteration that learned something but wrote
   nothing back wasted it.
6. At a milestone — a unit done, decisions accumulating, the body growing —
   `missionctl compact prepare` → dispositions → `validate` → `apply`
   (mission-command skill). Context stays bounded because the loop does.

## Unblocking ladder (in order)

1. **Investigate** — read the failing evidence, cited lines, git log, spec
   rows. Two focused passes; most blockers are located facts, not opinions.
2. **Doctrine** — check LOOP.md decisions, BRIEF/SPEC Decisions, the
   doctrine (`doctrine.md`, colocated with this skill: laws, standing
   orders, conventions), and memory. A standing answer is applied, not
   re-asked.
3. **Consult** — after two passes without a new fact, or at a genuine design
   fork: `rl consult`, backgrounded (the completion notification is the
   signal — no polling). The prompt carries the evidence, the candidate
   approaches with tradeoffs, the relevant spec excerpts, and the decision
   axiom (simplest, most correct, effort no factor). Consults inform; the
   driver decides. The value is independent eyes without the driver's
   sunk-cost bias.
4. **Decide provisionally** — reversible and interior: make the call, add a
   dated `decisions` entry with `status: provisional` (rationale + consult
   verdict in State), keep moving. Exercise the call through the declared
   verifier or bug bash where it affects observable behavior.
5. **Accumulate for the human** — irreversible, scope-changing, or Boundary
   items only. Keep working independent items; set `status: blocked` with
   one `blockers` entry per decision, each carrying evidence and a
   `proposed` answer, and terminate `blocked: needs N decisions`.

## Terminal states

- `done` — every gate `green`, the targeted floors have admissible evidence,
  and any required bug-bash gate is `green` against the current artifact. Stop
  the loop and write the handoff for the human's boundary
  steps. Once the boundary clears, `missionctl close` routes durable
  decisions to SPEC/BRIEF, marks linked mission rubric items with evidence,
  and deletes the loop — a closed campaign's loop left on the branch is a
  defect (doctrine standing order). Campaign done never implies mission
  achieved.
- `blocked` — the numbered blocker batch with proposed answers. The human's
  answers land as `ratified` decisions; the loop resumes.
- `budget-exhausted` — `iteration` reached `iteration_budget`, or — earlier
  — three consecutive iterations moved no unit or gate (structural
  non-convergence): stop honestly with what was tried and why it cannot
  converge. Raising the budget is the human's.
- `superseded` — a named replacement campaign takes over; close this loop
  with its evidence dispositions and start the replacement fresh.

## Red flags

- Narrative accumulating in the body instead of being compacted; decisions
  restated in prose instead of the `decisions` list.
- State stale while work advanced — the loop is part of the product.
- Gate `state` asserted without the gate having run this iteration.
- A consult treated as approval authority, or run before investigating.
- A mid-loop interactive question (attended: answer it, then it goes into
  decisions; unattended: a ladder defect).
- Ratified decisions re-litigated because a consult or specialized reviewer
  disagreed, absent new behavior evidence.
- A loop living outside git (untracked or harness-private paths) — the
  campaign then cannot move across hosts or harnesses.
- Successive campaigns appended to one `LOOP.md`, or campaign done treated
  as mission achieved.
- A unit advancing no declared target without a cited invariant or safety
  need.
