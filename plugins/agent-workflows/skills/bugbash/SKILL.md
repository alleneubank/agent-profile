---
name: bugbash
description: Use when a bug bash, dogfood run, visual review, or exploratory readiness check is requested, or a new feature or changed user flow is ready for acceptance.
---

# Bug bash

Exercise the actual artifact through its public surface. This is task execution,
not a source critique or a renamed unit-test run. Select a few realistic tasks,
including an important failure or interruption path, from the requested behavior
and remaining risks.

## When it runs

When the Verification law calls for one, run it after the author's own run and
any specialist review, before the human is asked for acceptance, a merge, or
device time. In a stack, bash each stack top as it forms, not once at the end.

Record the artifact, environment, starting state, tasks, blocking severity, and
time/task budget in the existing task record. Use owned fixtures and safe test
instances on the closest-to-live surface an agent can drive. An unavailable
environment is a block, not permission to substitute source inspection.

Use a fresh, task-briefed participant for an unrequested bash and whenever
independent acceptance is required. Author dogfood remains useful; do not label
it independent. A fresh participant gets the task and artifact, not the author's
preferred verdict. Physical-device, biometric, and other genuinely human-only
steps stay at the boundary.

## Visual pass

When the change has UI, judge the live screens and the author's before/after
captures against the repository's declared design standard; without one, use
the platform's own guidelines (Apple Human Interface Guidelines on Apple
platforms). Check each changed screen for clipping and layout at larger text
sizes and in dark mode, a clear primary action, labels a user and assistive
technology can read, and consistency with neighboring screens and other
platforms of the same app. Cite the guideline or neighboring screen a finding
departs from; taste without a reference is a note, not a finding.

## Findings

Capture observed behavior before diagnosing. A finding states expected and
observed behavior, shortest reproduction, severity, and evidence. Do not invent
findings from speculative implementation concerns. Fix only within authorization,
then rerun affected tasks on the changed artifact. Below-floor observations do
not silently expand the task.

Report `green`, `findings`, `blocked`, or `budget-exhausted`, with tasks completed
and evidence. Green means every required task ran on the named artifact with
no blocking finding. A budget limit, unavailable executor, or unrun task is not
a pass. Do not claim a clean application beyond the behavior exercised.
