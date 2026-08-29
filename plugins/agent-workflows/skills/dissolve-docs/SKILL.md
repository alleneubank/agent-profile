---
name: dissolve-docs
description: Use when the user calls a docs cleanup, a campaign has shipped, or the repo has accumulated narrative, planning, status, handoff, or loop docs whose authoritative content belongs in the standing docs (VISION, BRIEF, SPEC, README).
---

# Dissolve Docs

Mechanics for the doctrine standing order (loop-brief `doctrine.md`):
narrative, planning, and loop docs dissolve — anything important,
necessary, or authoritative migrates into the standing docs, the rest is
deleted. The standing-doc surface is the only durable documentation, and
git is the changelog: deleted text is demoted to history, never lost.

## Triage

Sweep the scope (repo, package, or branch) for docs and sort each into
one of three classes:

- **Standing** — VISION, BRIEF, SPEC, README, agent instruction files,
  skills. Migration targets, never candidates.
- **Durable reference** — describes the system as it is and is read to
  operate or extend it: runbooks, API references, maintained architecture
  docs. Keep, subject to the focus pass.
- **Candidates** — records how the work got here, what was planned, or
  what was true mid-flight: terminal LOOP.md campaigns (closed through
  `missionctl close`; a legacy `.claude/loop.md` or `MISSION.md` journal is
  routed by hand), `DELTA.md` / `DEVIATIONS.md` brief sidecars (a
  retired pattern — still-active floor waivers migrate to the BRIEF's
  Decisions, dated), PLAN / TODO / NOTES / STATUS / HANDOFF docs, phase
  and iteration journals, proposals whose decision already landed, design
  explorations, migration narratives.

The test is tense: "the system does X" survives; "we did / will do X"
dissolves. Classify by content, not path or filename. A LOOP.md whose
campaign has not reached a terminal state is exempt — dissolution rides
the ship — unless the user explicitly ends the campaign.

## Route

Walk each candidate section by section and route what is important,
necessary, or authoritative:

| Content | Destination |
| --- | --- |
| Direction, goals, what "done" means | VISION |
| Rubric status of a declared multi-campaign outcome | `.mission/mission.yaml` (via `missionctl close`) |
| Requirements, invariants, acceptance, non-goals | SPEC |
| Quality bar, taste calls, decided questions | BRIEF (Decisions) |
| Build / run / operate commands, onboarding | README |
| Reusable judgment for future agents | a skill (writing-skills) |
| History, superseded plans, dead ends, status | nowhere — delete |

- Rewrite before landing: standing docs are present-tense law. A migrated
  paragraph reads as if written for the target doc — never paste
  narrative verbatim.
- Verify before promoting: a claim moved into a standing doc is asserted
  as current truth — check that commands run, paths exist, behavior
  matches. Stale content is corrected or dropped, not relocated.
- Decisions land dated with a one-line rationale; provisional entries
  stay marked provisional — BRIEF/SPEC Decisions ratify only with human
  confirmation, so present the batch at the end.
- Content that must survive but fits no standing doc signals a missing
  doc: propose it; don't park narrative to dodge the question.

## Focus pass

Dissolution is also the moment to leave the surviving surface focused
and authoritative:

- One source of truth per fact: a fact stated in two docs will drift.
  Keep it in the doc that owns it; other mentions become links or die.
- Altitude: each standing doc has one job — VISION direction, SPEC
  contract, BRIEF quality law, README operation. Content sitting in the
  wrong doc moves to the right one while it is in hand.
- Contradiction check: where a surviving doc disagrees with the system,
  the system wins — fix the doc or flag it with evidence.
- The inventory shrinks: success is fewer files, each with a clear job.
  A doc nobody would consult to operate, extend, or judge the system has
  no job.

## Delete

- Delete dissolved files outright — no archive folder, no `-old` suffix,
  no commented-out blocks. An archive is a dissolution refusal.
- Sweep references to the deleted filenames (docs, CI, scripts, agent
  instructions) and fix or remove them.
- Land migrations and deletions as one changeset: the move is a single
  reviewable diff.

## Report

Close with one table — each candidate → dissolved or kept, with reason
and where its content moved — plus the Decisions batch awaiting
ratification and any contradictions flagged.

## Red flags

- Narrative pasted verbatim into a standing doc.
- A doc deleted with unmigrated decisions, invariants, or acceptance
  criteria still inside.
- Durable reference dissolved because of where it lives, or a journal
  kept because of where it lives.
- A terminal campaign loop surviving the cleanup — the defect the
  standing order exists to clear.
- The cleanup ends with more docs, or longer docs, than the content
  earned.
