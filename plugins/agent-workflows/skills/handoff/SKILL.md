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

When a `LOOP.md` exists, the loop is the campaign's memory: mid-campaign
continuation is its frontmatter/State write-back, committed with the work —
an iteration ending is not a handoff moment. Mint a handoff only at a
terminal state, as the boundary package for the human, or for non-campaign
sessions; its Decisions reference the loop's rather than forking them.

## Workflow

1. Gather only the facts needed to continue:
   - current repo path and branch
   - uncommitted and staged change summary
   - recent relevant commits
   - task requested, decisions made, and current terminal state
   - `missionctl context` output when a loop exists: loop id, current unit,
     red gates, blockers, and the evidence pointers already earned
2. Write to `~/.handoffs/handoff-<repo>-<shortname>-<timestamp>.md`.
3. Front-load the next action in the first 10 lines.
4. Include concrete file paths, commands, identifiers, and constraints.

## Output Shape

```markdown
# <what to do next>

<2-4 sentence state summary>

## What's done

- ...

## Loop state

- Loop / current unit: ...
- Targets and red gates: ...
- Admissible evidence: ...

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

- **"Acceptance / Verification" and "Decisions" are mandatory.** A handoff
  missing either fails this skill's own gate — do not write it without them.
  Acceptance lists every check that counts as done (flows to drive, deploy
  bumps, e2e floors), stated as evidence to show, not activities to perform.
  Decisions carries the calls already made — each marked ratified or
  provisional — so the receiving session inherits them instead of re-asking.
- Link to specs and docs instead of paraphrasing long context.
- Link to the one campaign `LOOP.md` (and `.mission/mission.yaml` when one
  is declared); never merge a later campaign's notes into the handoff or
  treat campaign completion as mission achievement.
- Keep the handoff short enough to scan; target 60-100 lines.
- Do not include secrets or pasted secret values.
- State publish, push, deploy, and approval boundaries explicitly.
- If a `.hunk/agent-context.json` rationale sidecar exists, note whether it still
  matches the diff (see `hunk-notes`).
