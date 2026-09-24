---
name: testing-best-practices
description: Use when choosing a verifier, deciding whether a check becomes a permanent test, diagnosing an unreliable test, or designing nontrivial regression coverage; routine execution of an established check needs no extra workflow.
---

# Verification

Start with the requested behavior and the important ways it could fail. Use
existing test commands and the smallest boundary that can expose those failures.
For an assembled-behavior bug, try the public path early; for isolated logic,
a focused example or property test may be sufficient. Record reproduction
limits rather than claiming an unobserved failure.

## Choosing evidence

- Check effects, not proxies: persistence needs a fresh read; delivery needs the
  destination's result; startup or a screenshot cannot establish either.
- Take every expected result from an oracle independent of the code under
  test: the user story, a spec, a published contract, the real system, or a
  property. An expectation derived from the finished implementation copies it
  and passes its defects.
- Prefer real dependencies, then behaviorally conformant fakes. Mock a boundary
  you own when useful; do not build a simulated third-party contract to prove
  the same simulation.
- Keep tests understandable: name the scenario, make important inputs explicit,
  and use discriminating expected results. Assert call order only when that
  interaction is itself the promised behavior.
- Unit tests, TDD, integration tests, and exploratory use are alternatives or
  complements selected by risk, not a checklist of layers. A new checker ships
  a known-broken case that shows it can fail.

## Evidence or permanent test

Once the change is verified, decide what outlives it. Probes, one-off scripts,
screenshots, traces, and exploratory runs are evidence: record what they showed
(command and result) with the change — its review, task, or PR — and discard
them.
Every permanent test is loaded, run, and maintained by each later change, so it
earns that cost by guarding one of:

- a user-visible or published contract, at the level its user relies on it;
- isolated logic whose failures are cheap to state and expensive to reach end
  to end — money, parsing, state machines, invariants; its cases are the
  failures stated from the spec;
- a defect that shipped. It gets one regression check at the smallest level
  that reproduces what the user observed, seen failing before the fix. A
  mistake introduced and fixed within the same task shipped nothing: nothing is
  added because of it and no comment narrates it; if the unit earns a test, its
  boundaries are cases like any other.

A **change detector** grades the implementation rather than the outcome: it
asserts calls on a collaborator you own when the call is not the promised
behavior, renders under stubbed UI to read props, compares constants or
fixtures to themselves, or grades a third-party library's behavior instead of
yours. It reddens on behavior-preserving change and passes real defects. Do not
write one. When your change must edit one or reddens one, delete it; replace it
only if what it stood in for meets the bar above, and say in the change record
what is left unproven.

## Reliable execution

Give concurrent runs their own state. Control clocks, randomness, environment,
and dependency versions where they affect repeatability. Wait for observable
conditions with deadlines; never use elapsed sleep as proof of success. Avoid
runtime test backdoors; explicit dependency injection is legitimate.

If a check fails, locate the cause before attributing it to the environment or
a flake. When the public path is the verifier, its environment is part of it:
a stale server or broken fixture yields a verdict about the environment, not
the change. Repair it or report the check blocked; a narrower test that cannot
reach the failure is no substitute. Reproduce claimed pre-existing failures at the baseline. A retry is
a diagnostic probe, not evidence of correctness; stop repeated structural
failure and report the block. Inspect progress before killing a slow run.

Record which inputs a result covered: reuse it while they are unchanged, and
not after they change. A new commit id, message, or squash alone does not
invalidate it. After changes, rerun only the affected checks. A required check
that cannot execute remains blocked, never replaced by static confidence.
