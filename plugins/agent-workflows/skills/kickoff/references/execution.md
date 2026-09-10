# Campaign execution

One `LOOP.md` is one bounded attempt: committed working memory targeting named
SPEC requirements, BRIEF floors, or optional mission rubric ids. Its YAML is
machine state; its body holds concise evidence and recovery notes. Durable
requirements and decisions live in SPEC/BRIEF, not a growing campaign journal.

## Author or resume

1. Inspect branch, tree, seed, existing requirements, and repository boundaries.
   An existing loop wins over stale session memory. Run `missionctl check` and
   repair invalid state before advancing it. For a legacy loop, use
   `missionctl inspect`, then `missionctl adopt --write` and inspect the result.
   Missing missionctl blocks the required lifecycle gate; direct reads support
   diagnosis but do not count as validation.
2. With no loop, fill the [template](template.md) from the agreement. Use the
   [schema](../../mission-command/references/schema.md) for field questions.
   Set a numeric `iteration_budget`; derive targets from the nearest contracts,
   not invented IDs. Write missing requirements before targeting them.
3. Name the gates before implementation. Start from the existing harness and
   material risks. Declare commands and green meanings. A bug-bash gate names
   artifact, environment, task/time budget, severity floor, and required fresh
   executor. Apply the shared high-risk approval/review law; approval already
   present in the agreement is not requested again.
4. Run `missionctl check`, then begin. A new `.mission/mission.yaml` is warranted
   only for an outcome spanning campaigns or repositories; ordinary branch work
   uses the loop alone. Keep a needed quality bar in BRIEF using
   `brief-best-practices`, rather than duplicating its schema here.

## Advance one unit

Read `missionctl context` and any loop body evidence needed for the current
unit. Follow dependencies and advance only declared targets (or a cited
invariant/safety requirement). The usual delivery phases are intent, SPEC,
PLAN, red reproducer, implementation, and selected verification; low-risk
non-runtime work does not manufacture a TDD or application gate.

Run the required gates in the shared order. Record commands, results, and
identity: relevant revision/dirty state, built artifact, environment, task or
charter. A new iteration or administrative loop edit does not invalidate
matching evidence. Reuse it with an explicit identity comparison; a material
change reruns from the earliest affected gate. A gate without admissible
evidence stays unknown or red, never asserted green.

After each iteration, write unit/gate states, `iteration`, `phase`, `updated_at`,
provisional decisions, blockers, and evidence pointers. Run `missionctl check`
and commit loop and work together when local commits are allowed and do not
need unavailable approval. A signing prompt is a boundary, not permission to
bypass signing. At milestones use `mission-command` compaction; preserve
unresolved work and route durable decisions instead of retaining old narrative.

## Resolve a block

Investigate the evidence and standing decisions first. After two focused passes
without a new fact, consult independent expertise when available and useful;
give it evidence, candidates, tradeoffs, and relevant contract excerpts. It
advises rather than approves. Make a reversible interior decision and log its
rationale; exercise any affected behavior. For a human-only decision, keep
working independent units, then report a numbered batch with evidence and
proposed answers. An unavailable required executor remains a blocked gate;
repeated dispatch or static critique cannot replace its execution.

## Stop honestly

- `done`: all targeted floors and required gates have current admissible
  evidence. Close through `mission-command`, route durable decisions, cite any
  linked mission rubric evidence, and remove the loop before a shared-branch
  merge. Campaign completion does not by itself prove a whole mission complete.
- `blocked`: record what was tried, the exact missing input/capability, and a
  proposed path. Preserve the loop for a resumed attempt after the blocker moves.
- `budget-exhausted`: stop at the cap, or after three consecutive iterations
  advance no unit or gate. Retain the loop and evidence for human disposition;
  never raise the budget autonomously. A declared budget is checked against its
  authoritative counter, not inferred from latency or model intuition.
- `superseded`: name the authorized replacement and close this attempt. Start
  the replacement in a fresh loop, never append it to the old one.

Closing may require an unfinished unit to be filed on a tracker. Honor the
agreement's issue-publication boundary: prepare the concrete issue content and
report pending closure when posting lacks authorization; do not silently post
or mark the unit complete to satisfy the reducer.

At every terminal, settle state, clean up only attributed campaign-created
scratch resources, and preserve requested deliverables and evidence. Save
non-obvious findings to available persistent memory. Use `sitrep` for the report
and unattended handoff path declared by kickoff. `blocked` and
`budget-exhausted` retain resumable state; closure removes only completed or
superseded attempts. If a required write-back cannot run, report that limitation
with the recovery path rather than claiming a clean terminal.
