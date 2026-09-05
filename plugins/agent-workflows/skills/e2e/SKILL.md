---
name: e2e
description: Use when running e2e tests, debugging test failures, or fixing flaky tests. Covers failure taxonomy, fix rules, and workflow. Never changes source code logic or API without spec backing.
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
- Replace `waitForTimeout` with auto-waiting locators
- Replace brittle CSS selectors with `getByRole`/`getByLabel`/`getByTestId`
- Fix race conditions with `expect()` web-first assertions
- Fix mock/route setup ordering (before navigation)
- **Never add arbitrary delays** - fix the underlying wait
- **Never add retry loops around assertions** - use the framework's built-in retry
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
- The TDD gate applies: the covering unit test is observed red before the fix (verifier law)
- Verifier integrity applies: never bend an e2e assertion toward buggy code (verifier law)
- **Never change API contracts or interfaces** without spec backing
- If no spec exists, climb the interior-decision ladder before asking: investigate (git log, linked tests, code intent), check the surface's Decisions and the doctrine, consult an independent model at a genuine fork. Still undecided: classify as unverified failure and batch the bug-vs-outdated question for the human — never block on it

## Source Code Boundary

E2e test fixes must not change application logic, API contracts, database schemas, or configuration defaults. The only exception: bug fixes where a spec explicitly defines the correct behavior and unit tests cover the fix.

## Human Retest Ladder

The human is the most expensive verifier — spend them last, and once.

1. Trace a reported failure downstream with tooling first: API probes (curl/grpcurl), database reads, service logs, targeted test runs.
2. Fix everything tooling can find before asking the human to manually retest; each retest round costs their attention and a context switch.
3. When a manual pass is genuinely needed (visual, UX, device-specific), charter
   it as one bounded bug bash and batch every open check into one request — never
   serial one-fix-one-retest rounds.

## Workflow

Run the repo's own e2e command (its package or task-runner script, with a
minimal reporter) once any required dev server or Tilt environment is up. The
colocated `SPEC.md`, and the supporting `*.spec.md` files it links, is the source
of truth for bug decisions. Parse failures into:

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

### Unit Tests Added
- `src/transfer.test.ts` - amount validation edge cases (covers BUG fix)
```

See `testing-best-practices` for async handling, flake classification, and preflight check patterns.
