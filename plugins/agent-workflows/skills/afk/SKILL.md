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

## Done State

End with either passing local checks and only publish/push remaining, a clear
decision blocker, or an approval-gate blocker. Write a handoff before stopping.

