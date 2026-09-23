---
name: brief-best-practices
description: Use when a surface needs a durable quality agreement or the user requests a BRIEF.md; ordinary drafts and repeated edits do not automatically need one.
---

# Quality briefs

A brief defines what acceptable quality means where the task or existing spec
leaves consequential judgment unresolved. Prefer the existing agreement when
it already answers that question. Do not require a mini-brief, reference example,
or never-list before every document, report, or visual draft.

Use `BRIEF.md` beside the surface it governs. Follow the repository's shape.
Keep only useful content: the acceptable outcome, important dimensions and
measurable thresholds, how those are checked, material failure conditions,
settled tradeoffs, and remaining human decisions. Examples help when words
alone leave acceptance ambiguous; do not invent numeric thresholds to fill slots.

Choose the verifier by the risk. Objective checks establish observable behavior;
independent task execution or judgment is needed when author knowledge or
subjectivity is a material risk, or the agreement requires it. Author dogfood
is useful but never independent. Use `bugbash` for selected exploratory tasks
and shared high-risk review requirements where applicable.

A passing check establishes only what it exercised. Do not weaken acceptance
to make a failing artifact pass; surface an infeasible requirement and its
consequences. Keep consequential decisions and their rationale in the existing
agreement, distinguishing proposals from human-ratified boundaries.

Revise the brief when the quality agreement changes, not after every iteration.
Put live progress in the existing task record. Remove obsolete briefs when
the governed surface is removed. The adjacent templates and examples are
illustrations for tasks that need that structure, not required document forms.
