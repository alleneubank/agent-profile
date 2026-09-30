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

Under a coordinator, its charter and log are the campaign's memory; a
handoff references their Decisions rather than forking them.

## Workflow

1. Gather only the facts needed to continue:
   - current repo path and branch
   - uncommitted and staged change summary
   - recent relevant commits
   - task requested, decisions made, and current terminal state
2. Write to `~/.handoffs/handoff-<repo>-<shortname>-<timestamp>.md`.
3. Front-load the next action: the title and opening lines answer "what do I do now."
4. Include concrete file paths, commands, identifiers, and constraints.

## Output Shape

```markdown
# <what to do next>

<short state summary>

## What's done

- ...

## What to do

1. ...

## Acceptance / Verification

- <every check that counts as done: flows to drive, deploy bumps, e2e floors>

## Decisions

- <pre-made calls, each marked ratified|provisional, so the next session
  never re-asks and never inherits an unratified call as fact>

## Blockers or boundaries

- ...
```

## Rules

- Every handoff has "Acceptance / Verification" and "Decisions" sections.
  Acceptance lists every check that counts as done (flows to drive, deploy
  bumps, e2e floors), stated as evidence to show, not activities to perform.
  Decisions carries the calls already made — each marked ratified or
  provisional — so the receiving session inherits them instead of re-asking.
- Link to specs and docs instead of paraphrasing long context.
- Link to the coordinator's charter and log when one exists; never merge a
  later campaign's notes into the handoff.
- Keep the handoff short enough to scan in one sitting.
- Do not include secrets or pasted secret values.
- State publish, push, deploy, and approval boundaries explicitly.
- If a `.hunk/agent-context.json` rationale sidecar exists, note whether it still
  matches the diff (see `hunk-notes`).
