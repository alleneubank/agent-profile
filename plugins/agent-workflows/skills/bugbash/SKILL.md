---
name: bugbash
description: Use when a bug bash, dogfood run, or exploratory readiness check of an application or system is requested.
---

# Bug bash

Exercise the actual artifact through its public surface. This is task execution,
not a source critique or a renamed unit-test run. Select a few realistic tasks,
including an important failure or interruption path, from the requested behavior
and remaining risks.

Record the artifact, environment, starting state, tasks, blocking severity, and
time/task budget in the existing task record. Use owned fixtures and safe test
instances. An unavailable environment is a block, not permission to substitute
source inspection.

Use a fresh, task-briefed participant when the request or agreement requires
independent acceptance. Author dogfood remains useful; do not label it
independent. A fresh participant gets the task and artifact, not the author's
preferred verdict. Physical-device, biometric, and other genuinely human-only
steps stay at the boundary.

Capture observed behavior before diagnosing. A finding states expected and
observed behavior, shortest reproduction, severity, and evidence. Do not invent
findings from speculative implementation concerns. Fix only within authorization,
then rerun affected tasks on the changed artifact. Below-floor observations do
not silently expand the task.

Report `green`, `findings`, `blocked`, or `budget-exhausted`, with tasks completed
and evidence. Green means every required task ran on the named artifact with
no blocking finding. A budget limit, unavailable executor, or unrun task is not
a pass. Do not claim a clean application beyond the behavior exercised.
