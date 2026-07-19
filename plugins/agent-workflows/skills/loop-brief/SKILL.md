---
name: loop-brief
description: Use when a feature branch or campaign needs an autonomous multi-session loop — the user asks for a LOOP.md or a self-driving plan to finish a branch, says they are stepping away with work in flight, or a session must run or resume a campaign that has a LOOP.md (legacy path .claude/loop.md).
---

# Loop Brief

`LOOP.md` is a campaign charter — in mission-command terms, the campaign's
operation order: the law and the live journal of an autonomous loop, fused
in one file. The law half (unblocking ladder, edit
policy, budgets, boundaries) is invariant and comes from the template; the
journal half (State, Decisions) is written by the loop as it learns. The
file is the loop's memory — every iteration reads it first and writes it
back last. It completes the stack's artifact family — VISION → SPEC →
BRIEF → LOOP — and like SPEC.md/BRIEF.md it is **colocated** with the work
it drives and **committed with it**, so any host, harness, or fresh session
resumes the campaign from git alone. It is branch-scoped and disposable;
taste that outlives the branch belongs in BRIEF/SPEC Decisions or the
shared profile, not here.

## Invocation

Harness-agnostic by design: any driver that can read the repo can run an
iteration — an interval scheduler, a cron'd headless run, a detached
worker, or a human-started session told to continue the campaign.

- `LOOP.md` absent → author it (below), restate the mission for
  confirmation if the user is present, then run iteration 1.
- `LOOP.md` present → run one iteration per its protocol. A legacy
  `.claude/loop.md` counts; prefer migrating it to a colocated `LOOP.md`.

## Authoring

Copy `template.md` (colocated with this skill) and fill only the per-branch
layer; never re-derive the invariant sections from scratch. Crystallize from
what already exists: mission and the interior-green definition from
VISION/SPEC/BRIEF and the session; verifier commands from the repo harness
(discovery order: task runner → repo docs → project defaults); boundaries
from repo instructions plus the profile's Boundary law; known pre-existing
failures only with cited evidence — never as a place to park new breakage.
A wrong mission compounds every iteration; get that paragraph right first.

## Iteration protocol

1. Read `LOOP.md` top to bottom. State and Decisions override any stale
   memory of prior sessions.
2. Restate where the campaign stands and this iteration's smallest next
   unit as a self-contained achievable goal — the contract the iteration
   runs against — then execute it through the ADF gates the Work plan
   names.
3. Run the named verification floors; the verifier decides, not confidence.
4. Blocked? Climb the ladder (below). Never freeze on question #1.
5. Close by writing back: rewrite State (facts learned, walls hit or
   cleared, commit SHAs), append provisional Decisions, commit the charter
   with the work. An iteration that learned something but wrote nothing
   back wasted it.

## Unblocking ladder (in order)

1. **Investigate** — read the failing evidence, cited lines, git log, spec
   rows. Two focused passes; most blockers are located facts, not opinions.
2. **Doctrine** — check LOOP.md Decisions, BRIEF/SPEC Decisions, the
   doctrine (`doctrine.md`, colocated with this skill: laws, standing
   orders, conventions), and memory. A standing answer is applied, not
   re-asked.
3. **Consult** — after two passes without a new fact, or at a genuine design
   fork: `rl consult`, backgrounded (the completion notification is the
   signal — no polling). The prompt carries the evidence, the candidate
   approaches with tradeoffs, the relevant spec excerpts, and the decision
   axiom (simplest, most correct, effort no factor). Independent frontier
   eyes without the driver's sunk-cost bias.
4. **Decide provisionally** — reversible and interior: make the call, log a
   dated Decisions entry (rationale + consult verdict), keep moving. The
   review gate checks it downstream.
5. **Accumulate for the human** — irreversible, scope-changing, or Boundary
   items only. Keep working independent items; terminate
   `blocked: needs N decisions` with a numbered batch, each entry carrying
   evidence and a proposed answer.

## Terminal states

- `done` — the interior-green checklist in LOOP.md holds, every floor cited
  with output. Stop the loop; write the handoff for the human's boundary
  steps (publish, attended gates).
- `blocked: needs N decisions` — the numbered batch with proposed answers.
  The human's answers get appended to Decisions; the loop resumes.
- `budget-exhausted` — the charter's hard iteration cap is reached, or —
  earlier — three consecutive iterations show no measurable movement on any
  checklist item (structural non-convergence): stop honestly with what was
  tried and why it cannot converge. Every charter sets a numeric cap at
  authoring; raising it is the human's.

## Red flags

- Re-deriving the invariant sections ad hoc instead of copying the template.
- State stale while work advanced — the journal is part of the product.
- A consult treated as approval authority, or run before investigating.
- A mid-loop interactive question (attended: answer it, then it goes into
  Decisions; unattended: a ladder defect).
- Ratified Decisions re-litigated because a reviewer or consult disagreed.
- A charter living outside git (untracked or harness-private paths) — the
  campaign then cannot move across hosts or harnesses.
