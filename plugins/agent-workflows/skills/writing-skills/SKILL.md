---
name: writing-skills
description: Use when creating or editing a skill and you need it to be discoverable, concise, and native to the target harness
---

# Writing Skills

## Overview

A skill should capture reusable judgment, not a story about one session.

**Core principle:** Write the minimum instructions that reliably change future agent behavior on the right class of tasks. What generalizes is weakness, not brevity: state each rule at the weakest level that still excludes the failures it exists to prevent — a terse absolute is often stronger than the failure warrants, and a rule wearing one incident's details won't fire on the next one.

## Directory Choice

Choose the source of truth before editing:

- Shared skill source: edit the repo-managed skill in `agent-profile`, not a generated runtime copy.
- Harness-specific adaptation: create a clearly named separate skill instead of installing duplicate skill names with divergent behavior.

In this repo, shared skills live under:
- `plugins/engineering-practices/skills/<skill-name>/`
- `plugins/agent-workflows/skills/<skill-name>/`

## When to Create a Skill

Create or update a skill when:
- The technique is reusable across tasks
- The agent repeatedly misses the same judgment call
- A short document can prevent recurring mistakes

Do not create a skill for:
- One-off project context
- Purely mechanical rules that should be enforced by code or linting
- Content that belongs in repo instructions instead

## Structure

Each skill directory should stay small:

```text
skill-name/
  SKILL.md
  supporting-file.md   # only when needed
```

Prefer one concise `SKILL.md`. Add supporting files only for heavy reference material.

## Metadata Rules

Frontmatter supports only:
- `name`
- `description`

Description rules:
- Start with `Use when...`
- Describe triggering conditions, not the workflow
- State the weakest trigger that still excludes wrong contexts: describe the
  task shape the skill governs, not one incident's surface details — an
  over-specific description under-triggers
- Avoid harness-specific claims unless the skill is intentionally harness-specific

## Authoring Rules

- Shared skills default to harness-agnostic language: no vendor tool names,
  no harness-only paths ("your forge CLI" over a bare product name). Assumed
  primitives travel worse than names do — bootstrap hooks, subagent dispatch,
  a plan/progress mechanism — so write to the capability ("your harness's plan
  mechanism, when one exists"). A harness-specific skill is the marked
  exception, named as such.
- Name real tools and files agents actually have — across every harness the
  skill ships to.
- Prefer concrete triggers over broad abstractions.
- When several rules share a shape, mint the concept once and state one weak
  rule over it, instead of enumerating strong variants.
- Cut repeated explanations aggressively.
- Include red flags when the failure mode is predictable.

## Testing the Skill

Validate the skill against realistic tasks:

1. Observe baseline behavior on a representative request.
2. Write or revise the skill to address the real failure.
3. Re-run the task and compare behavior.
4. Tighten wording only where the skill still leaves loopholes.

Use subagents for testing only when they add signal. They are optional, not the point.

## Red Flags

- Descriptions that summarize the full workflow
- Instructions referencing tools unavailable in the target harness
- Long examples that restate the same rule
- Rules encoding one incident's surface details (tool names, paths, exact
  phrasings) where the failure was structural
- Skills that restate AGENTS.md law or doctrine entries — skills carry
  mechanics and point at law
- Vendor tool names or harness-only paths in a shared skill
