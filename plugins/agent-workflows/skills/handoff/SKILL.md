---
name: handoff
description: Use when preserving enough task context for another agent or future session to continue without the current conversation
---

# Handoff

Create a concise, standalone handoff in `~/.handoffs/` when work is incomplete,
blocked, or ready for another agent to pick up.

A ship/pivot/wait moment is a session boundary: right after a merge, release,
or prod-verify, or when work is blocked upstream, prefer minting a handoff and
starting fresh over compacting — the next session opens with this artifact
instead of inherited sprawl.

## Workflow

1. Gather only the facts needed to continue:
   - current repo path and branch
   - uncommitted and staged change summary
   - recent relevant commits
   - task requested, decisions made, and current terminal state
2. Write to `~/.handoffs/handoff-<repo>-<shortname>-<timestamp>.md`.
3. Front-load the next action in the first 10 lines.
4. Include concrete file paths, commands, identifiers, and constraints.

## Output Shape

```markdown
# <what to do next>

<2-4 sentence state summary>

## What's done

- ...

## What to do

1. ...

## Acceptance / Verification

- <every check that counts as done: flows to drive, Tiltfile bumps, e2e floors>

## Decisions

- <pre-made calls so the next session never re-asks>

## Blockers or boundaries

- ...
```

## Rules

- **"Acceptance / Verification" and "Decisions" are mandatory.** A handoff
  missing either fails this skill's own gate — do not write it without them.
  Acceptance lists every check that counts as done (flows to drive, Tiltfile
  bumps, e2e floors), stated as evidence to show, not activities to perform.
  Decisions carries the calls already made so the receiving session inherits
  them instead of re-asking.
- Link to specs and docs instead of paraphrasing long context.
- Keep the handoff short enough to scan; target 60-100 lines.
- Do not include secrets or pasted secret values.
- State publish, push, deploy, and approval boundaries explicitly.
- If a changeset is pending human review, note whether a `.hunk/agent-context.json`
  rationale sidecar was written and still matches the diff (see `hunk-notes`).

