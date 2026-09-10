---
name: afk
description: Use when the user says they are stepping away and the agent should continue without interactive approvals
---

# AFK Work

The user is unavailable for synchronous decisions. Continue the authorized
work; presence changes neither its scope nor existing authorization. Do not
start a new campaign or manufacture documents solely because the user left.

- Continue safe local edits, tests, builds, and already-authorized operations
  whose authentication and approvals are available noninteractively.
- Avoid commands that can wait for biometrics, credential-manager approval,
  sudo, browser login, or another new human response. A pending approval stays
  a boundary event; never alter credential configuration to route around it.
- Use bounded processes and waits. Make reversible interior decisions from
  evidence and standing guidance; record consequential ones for the handoff.
- Keep working independent items when a boundary blocks one action. At the
  stop, report the evidence, remaining decisions, and proposed next steps.

An active campaign continues under `kickoff` with its existing budget and
terminal rules. A bounded task with no LOOP.md can finish in the current
session using its existing plan and checks. If recovery across sessions becomes
necessary, preserve a handoff; use kickoff to establish a campaign only when
its scope and budget are available. Save unattended outcomes and unfinished
state to an available persistent handoff location before stopping.
