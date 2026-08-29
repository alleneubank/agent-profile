---
name: afk
description: Use when the user says they are stepping away and the agent should continue without interactive approvals
---

# AFK Work

The user is away: no interactive approval will arrive. Campaign protocol —
scope derivation, the unblocking ladder, terminal states, budgets — is the
loop-brief skill's; when a `LOOP.md` exists, run its iterations.
This skill adds the operational constraint: nothing you run may block on a
prompt.

## Allowed

- Read and edit files; run local tests, builds, typechecks, and linters.
- Commit local changes when commits do not require signing prompts.
- Read-only issue, PR, and CI commands with noninteractive auth already
  provisioned.

## Avoid — anything that can block on a human

- Push, force-push, deploy, publish, merge (the publish boundary,
  regardless of presence).
- Commands that trigger credential-manager, biometric, sudo, browser, or
  new auth flows; secret reads without a provisioned noninteractive path.
- Unbounded foreground processes.

## No loop?

Derive scope from committed artifacts: `LOOP.md`, handoffs, specs, recent
commit messages. Uncovered decisions climb the ladder — reversible interior
calls are made and logged as dated provisional Decisions, not accumulated.
Terminate per the loop's terminal states (`done`, `blocked: needs N
decisions` with a numbered evidenced batch, or `budget-exhausted`), and
write back the loop — or a handoff when no loop exists — before
stopping.
