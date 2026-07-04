---
name: afk
description: Use when the user says they are stepping away and the agent should continue without interactive approvals
---

# AFK Work

When the user is away, continue only through work that can complete without
interactive approval.

## Allowed

- Read and edit files.
- Run local tests, builds, typechecks, and linters.
- Commit local changes when commits do not require signing prompts.
- Use read-only issue, PR, and CI commands that already have noninteractive auth.

## Avoid

- `git push`, force-push, deploy, publish, or merge.
- Commands that trigger 1Password, SSH agent, Touch ID, sudo, browser prompts, or new auth flows.
- Secret reads unless a safe noninteractive path was already provisioned.

## Missing Directive

When the directive artifact (task file, handoff, brief) is missing, or a
decision arises that it does not cover:

- Derive scope from committed artifacts first: handoffs, specs, the task list,
  recent commit messages.
- If scope still cannot be derived, terminate blocked with the accumulated
  questions listed. Never fire interactive questions mid-loop, and never
  invent scope.

## Done State

End with either passing local checks and only publish/push remaining, a clear
decision blocker, or an approval-gate blocker. Write a handoff before stopping.

