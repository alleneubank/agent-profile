---
name: e2e
description: Use when running or repairing a scripted end-to-end test suite.
---

# E2E Testing

Scripted E2E encodes known contracts; a bug bash explores the assembled surface
through real user or operator tasks. When the request is to dogfood, bug-bash,
or make a behavior-first readiness call, load the `bugbash` skill. Use this skill
to run and repair the scripted E2E floor that supports that work.

## Failure Taxonomy

Treat these as diagnostic hypotheses, not labels inferred from pass/fail history:

**A. Flaky** (test or environment nondeterminism without a product defect)
- Uncontrolled test clocks, shared fixtures, stale selectors, missing waits, or
  infrastructure variance
- A retry may provide evidence, but a pass on retry does not prove flakiness; an
  intermittent product race remains a product bug

**B. Outdated** (test no longer matches implementation)
- Test asserts old behavior that was intentionally changed; selectors reference removed elements
- Symptom: consistent failure, app works correctly

**C. Bug** (implementation doesn't match spec)
- Test correctly asserts spec'd behavior, code is wrong
- **Only classify as bug when a spec exists to validate against**
- If no spec exists, classify as "unverified failure" and report to the user

Locate the uncontrolled input or contract mismatch before choosing a category.
Repeated failure does not prove determinism, and intermittent failure does not
exonerate the product.

## Fix Rules by Category

**Flaky fixes:**
- **Never add arbitrary delays or retry loops around assertions** - fix the
  underlying wait and use the framework's built-in retry; locator, wait, and
  mock-ordering rules live in the framework skill (e.g. `playwright-best-practices`)
- Fix the owner of the nondeterminism: product races are product fixes; shared
  fixture, clock, selector, and synchronization defects belong to the harness

**Outdated fixes:**
- Update test assertions to match current (correct) behavior
- Update selectors to match current DOM/API
- **Never change source code** - the implementation is correct, the test is stale
- Before updating, check what the test asserts. A selector or DOM update to a test that does assert user-visible behavior is an ordinary update; a test that asserts which calls fired rather than what the user sees is a change detector, and re-syncing it to the new call sequence launders it — rewrite it against the observable outcome or delete it

**Bug fixes:**
- Quote the spec section that defines expected behavior
- Fix the source code to match the spec
- Reproduce the failure before fixing when practical. The E2E reproducer can supply regression coverage; add a narrower test only for a risk or diagnostic benefit it covers better.
- Never bend an e2e assertion toward buggy code.
- **Never change API contracts or interfaces** without spec backing
- If no spec exists, before asking: investigate (git log, linked tests, code intent), check the surface's Decisions and other standing decisions, consult an independent model at a genuine fork. Still undecided: classify as unverified failure and batch the bug-vs-outdated question for the human — never block on it

## Source Code Boundary

E2e test fixes must not change application logic, API contracts, database schemas, or configuration defaults. The only exception: authorized bug fixes where a spec explicitly defines the correct behavior and faithful behavioral verification covers the fix. That verification may be the E2E test itself; no additional unit test is required solely for permission to fix the bug. High-risk approval and specialist gates still apply.

## Human Retest Ladder

The human is the most expensive verifier — spend them last, and once.

1. Trace a reported failure downstream with tooling first: API probes (curl/grpcurl), database reads, service logs, targeted test runs.
2. Fix everything tooling can find before asking the human to manually retest; each retest round costs their attention and a context switch.
3. When a manual pass is genuinely needed (visual, UX, device-specific), charter
   it as one bounded bug bash and batch every open check into one request — never
   serial one-fix-one-retest rounds.

## Workflow

Run the repo's own e2e command (its package or task-runner script, with a
minimal reporter) once any required dev server or Tilt environment is up and
its services and test users respond; log leftover state instead of failing on
it. The colocated `SPEC.md`, and the supporting `*.spec.md` files it links, is
the source of truth for bug decisions. Parse failures into:

| Test | File | Error | Category |
|---|---|---|---|
| `login flow` | `auth.spec.ts:42` | timeout waiting for selector | TBD |

For each failure: read the test and source it exercises, check the corresponding
contract, locate the source of nondeterminism or mismatch, then assign a category
(flaky / outdated / bug / unverified). Retry outcome is evidence, not the
classification rule. Fix by category, re-run, and report:

```
## E2E Results

**Run**: `yarn test:e2e` on <date>
**Result**: X/Y passed

### Fixed
- FLAKY: `auth.spec.ts:42` - replaced waitForTimeout with getByRole wait
- OUTDATED: `profile.spec.ts:88` - updated selector after header redesign
- BUG: `transfer.spec.ts:120` - fixed amount validation per SPEC.md#transfers

### Remaining Failures
- UNVERIFIED: `settings.spec.ts:55` - no spec, needs user decision

### Evidence
- Artifact/environment: <tested revision, build and target>
- `artifacts/transfer-trace.zip` - actual transfer outcome and error path
- `artifacts/transfer-result.png` - visible result, not proof of settlement

### Regression Coverage
- <existing or added behavior check; omit additional tests when redundant>
```

See `testing-best-practices` for condition waits and flake diagnosis.
