---
name: handoff
description: Use when preserving enough task context for another agent or future session to continue without the current conversation
---

# Handoff

Create a concise, standalone handoff in `~/.handoffs/` when work is incomplete,
blocked, or ready for another agent to pick up.

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

## Verification

- ...

## Blockers or boundaries

- ...
```

## Rules

- Link to specs and docs instead of paraphrasing long context.
- Keep the handoff short enough to scan; target 60-100 lines.
- Do not include secrets or pasted secret values.
- State publish, push, deploy, and approval boundaries explicitly.

