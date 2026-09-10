---
name: tee-up
description: Use when the user shares a draft prompt or slash-command invocation and asks what to add, whether it is ready, or to tee it up before running it; the draft is reviewed, never executed.
---

# Tee Up

Prepare the agreement for `kickoff`: review a draft prompt or slash invocation
and return a refined one. The
draft is the text following the skill invocation. The output is the refined
prompt in a code block plus a short list of what changed and why. Report and
stop: the refined prompt runs in a fresh session so the executor does not
inherit this review's context.

## Gather before judging

Wording cannot be graded until what it already inherits is known.

- Read the `SKILL.md` of each skill the draft names unless already available
  in context; note what each already
  mandates (presence, budgets, terminal states, boundaries, cleanup).
- Read the seed the draft points at — `LANE.md`, `LOOP.md`, an issue, a
  handoff — and note what it already declares.
- Check persistent memory for feedback on this workflow, when the harness
  has one.
- Verify the tree state the draft assumes (branch, clean or dirty, files it
  names exist).

## Grade

Mark each item `covered-by-skill` (name the skill), `covered-by-draft`, or
`missing`:

- Presence: attended or unattended.
- Seed or objective: what the work starts from.
- Acceptance: the observable outcome and the verifier that can decide it.
- Scope and non-goals: what the execution is authorized to change.
- Budget: iterations, time, or tasks.
- Skills to load before the governed actions.
- Boundary and existing authorization: concrete artifacts/refs, publication,
  issue operations, and any required high-risk plan decision. Do not reset
  authorization already given.
- What "clean up" means: processes, fixtures, containers, worktrees,
  untracked files.
- Outputs bound to every terminal state, with a location that survives the
  session.
- Memory write-back of non-obvious findings.

Classify high-risk work and the required evidence while preparing the agreement;
settled approval carries into execution. Load detailed references only for an
unresolved argument or requirement, not every implementation step the executor
might eventually take.

## Refine

- Add only `missing` items. Never restate what a named skill enforces; the
  refined prompt inherits it by naming the skill.
- Keep the draft's intent and vocabulary; change the smallest span that
  closes each gap.
- Say which parts are per-invocation arguments (seed, budget, presence) and
  which recur unchanged across invocations and belong baked into a skill.

## Red flags

- Refining wording without having read the named skills.
- Running the draft, or any part of it, "to see what it does".
- A refined prompt longer than the draft with nothing `missing` closed.
- A coverage claim for a skill the draft does not name or that was not read.
