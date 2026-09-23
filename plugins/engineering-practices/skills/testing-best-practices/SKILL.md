---
name: testing-best-practices
description: Use when choosing a verifier, diagnosing an unreliable test, or designing nontrivial regression coverage; routine execution of an established check needs no extra workflow.
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
- Prefer real dependencies, then behaviorally conformant fakes. Mock a boundary
  you own when useful; do not build a simulated third-party contract to prove
  the same simulation.
- Keep tests understandable: name the scenario, make important inputs explicit,
  and use discriminating expected results from the contract rather than the
  implementation. Assert call order only when that interaction is itself the
  promised behavior.
- Unit tests, TDD, integration tests, and exploratory use are alternatives or
  complements selected by risk, not a checklist of layers. Existing required
  checks still run. Permanent tests earn their maintenance cost through useful
  regression protection.
- A bug fix gets one regression test that fails without the fix; add another
  only for a named risk it would expose. A new checker ships a known-broken
  case that shows it can fail.

## Reliable execution

Give concurrent runs their own state. Control clocks, randomness, environment,
and dependency versions where they affect repeatability. Wait for observable
conditions with deadlines; never use elapsed sleep as proof of success. Avoid
runtime test backdoors; explicit dependency injection is legitimate.

If a check fails, locate the cause before attributing it to the environment or
a flake. Reproduce claimed pre-existing failures at the baseline. A retry is a
diagnostic probe, not evidence of correctness; stop repeated structural failure
and report the block. Inspect progress before killing a slow run.

Record which inputs a result covered: reuse it while they are unchanged, and
not after they change. A new commit id, message, or squash alone does not
invalidate it. Do not create a second report if the existing task record can
link the evidence. After changes, rerun only the affected checks.

Use specialist review for the high-risk classes in shared instructions and
`bugbash` when asked. A required check that cannot execute remains blocked,
never replaced by static confidence. Stop when the selected check passes.
