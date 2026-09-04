---
name: bugbash
description: Use when an operable application or system needs dogfooding, a bug bash, or a behavior-first readiness gate through realistic user or operator tasks. Not for generic static code review.
---

# Bug Bash

A bug bash discovers defects by using the exact built application or system as
a user or operator would. It is a task-execution gate, not a diff critique. Use
it when risk lives in assembled behavior, integrations, state transitions,
usability, or operability; use deterministic tests and specialized reviews for
the risks they can measure better.

## Charter the run

Before touching the surface, write the smallest charter that makes the result
reproducible:

- exact artifact, revision, build mode, environment, and starting state;
- user or operator roles and the public entry point each role uses;
- representative tasks derived from the SPEC, BRIEF, support history, and the
  highest-risk seams, including important failure or interruption paths;
- evidence to capture before diagnosis (logs, screenshots, traces, exported
  state, timestamps), with secret-bearing fields excluded;
- a severity scale with a blocking floor, plus a time or task budget and the
  terminal states `green`, `findings`, `blocked`, and `budget-exhausted`.

Keep the task set small and high-yield. A scripted E2E suite can establish known
contracts before the bash; it does not replace exploratory use of the assembled
surface.

## Independence

Author-run dogfood is valid discovery. A terminal experiential gate is stronger
when a fresh, disinterested participant receives only the charter, build, and
allowed environment—not the implementation diff, the author's reasoning, or a
list of suspected bugs. The participant can be another agent when the full user
path is automatable. A required physical device, biometric, live credential, or
subjective human reaction stays at the declared Boundary. Freshness is a
capability, not a requirement that every harness provide subagents: when no
fresh participant can execute the path, keep author dogfood labeled discovery
and hand the terminal task to the Boundary rather than treating the author as
independent.

## Execute through the public surface

1. Install or start the exact artifact and prove the environment is healthy.
   An artifact that cannot be installed, launched, observed, or reset has found
   a setup or operability defect; do not replace the run with source inspection.
2. Enter through the same UI, CLI, API, or operational control plane as the
   named role. Complete tasks naturally. Do not compensate for confusing or
   broken behavior with knowledge of the implementation.
3. Exercise the chartered happy paths, meaningful failure paths, interruptions,
   restarts, and state transitions. Explore adjacent transitions only while they
   fit the declared risk and budget.
4. Capture what happened before reading source or diagnosing. Attempt one
   controlled reproduction from a known state. An intermittent product race is
   still a product finding; retry outcome alone never classifies it as flaky.

## Findings

A finding needs observable evidence:

| Field | Required content |
|---|---|
| ID and severity | Stable ID and the charter's severity level |
| Task and setup | Role, starting state, artifact, and environment |
| Action | The shortest exact reproduction through the public surface |
| Observed | What the user or operator actually experienced |
| Expected | SPEC/BRIEF contract, established product behavior, or the usability/operability floor |
| Evidence | Artifact paths or native log/trace references, with no secret values |

Do not manufacture findings from speculative source concerns. After observation,
trace the behavior through logs and code to locate the root cause. Fix findings
only when the request or campaign authorizes fixes. A fix is complete when the
reproducer is observed red before the change, the targeted task passes after it,
and the affected task set is rerun. If a cheap deterministic check could have
caught the defect, add that regression floor.

`green` means every required task ran on the named artifact with no finding at or
above the blocking floor. `findings` means at least one such finding remains.
Below-floor observations remain concise follow-up notes and do not keep the gate
open. If the required build or environment is genuinely unavailable, finish
`blocked` with the failed preflight evidence and what would unblock it. If the
budget ends with required tasks unrun, finish `budget-exhausted`, name those
tasks, and keep the gate non-green. Static review is not a substitute for a bug
bash that never ran.

## Report

Lead with `Bug bash: green | findings | blocked | budget-exhausted`, then name
the artifact and environment, tasks completed versus chartered, blocking
findings, evidence, and untested boundaries. A green report claims only the
tasks and state transitions that actually ran.

## Red flags

- Reading the diff first and turning implementation suspicions into findings.
- Calling a test suite alone a bug bash.
- Marking a retrying product race as test flake without locating the source of
  nondeterminism.
- Serial one-fix/one-human-retest requests instead of batching the remaining
  human boundary once.
- Continuing past the charter's budget or claiming green with skipped tasks.
