---
name: testing-best-practices
description: Use when designing tests, writing test cases, planning test strategy, building or judging a verifier, or attributing test failures. Covers verifier design, unit/integration/e2e layering, and verifier discipline (flake attribution, base-commit repro, broken-verifier handling).
---

## Verifier design

`AGENTS.md` holds the contract a verifier must satisfy — independent,
fail-closed, integrity, done-claims-carry-evidence. This is how to build
one that measures the real goal.

- **Faithful** — measures the real goal, not a gameable proxy; a loop
  optimizes its verifier, so an unfaithful one polishes the wrong thing.
- **Cheap and fast** — seconds-per-look, or the loop starves.
- **Harness first, briefed reviews** — floors gate the interior; never
  outsource to the oracle what a floor can decide. Every review carries the
  contract of what it grades: intended outcome, what to judge now, the
  invariants, acceptance evidence, and the work explicitly deferred to a
  later unit. A reviewer not told the change is intermediate will reject it
  for being intermediate. Declared deferred work is not a finding;
  regressions in the current unit and violations of its stated contract
  are.
- Few, well-crafted, broad-coverage: build the surface's harness, not the
  task's check — the next feature reuses it for free. Build cheap verifiers
  freely; propose expensive ones. The harness runs against a deterministic
  proxy; the live system is the final gate, human-attended — a loop needing
  live secrets to verify is built at the wrong altitude.
- Realism: integration over mocked units for data flow and permissions;
  mocks for external services, never your own data layer. Visual/UI floors
  are the change observed on the live surface. Before done: would this
  survive a manual walkthrough?

## Test layering policy

### Unit tests

Purpose: verify individual functions and invariants in isolation.

- **Data-driven**: parameterized tables covering happy path, boundary, error, and edge cases.
- **Property-based**: fuzz invariants that must hold across all inputs (e.g., idempotency, sort stability, roundtrip serialization).
- **Cross the boundary**: cover the transition from valid to invalid, not just samples of each — where data moves across the valid/invalid line is where the bugs live.
- Derive cases from the module's public API surface: input types/constraints, output shape, error modes, invariants.

### Integration / contract tests

Purpose: verify interactions between components and external services.

- **API envelope**: request/response shape, status codes, content types, pagination.
- **Error contract**: error codes, error shapes, rate limiting, retries.
- **Auth and scoping**: token validation, role-based access, tenant isolation.
- **Eventual consistency**: verify convergence within bounded time; poll rather than sleep.
- Reuse auth state across tests where possible; avoid redundant login flows.

### E2E tests

Purpose: verify real user workflows through the full stack.

- No mocks; exercise real services, databases, and APIs.
- Happy-path workflows only; save edge cases for lower layers.
- **State-tolerant**: never assume a clean slate; tolerate and work with prior state.
- **Idempotent**: safe to run repeatedly without cleanup between runs.
- **Flow-oriented**: validate real data paths end-to-end rather than isolated assertions.

## Hard rules

- **Never invent signatures, source locations, or line numbers.** Only reference what you have read from the codebase.
- **No fabricated fixtures.** Derive test data from actual schemas, types, or seed data in the repo.
- **No test-only hacks in product code.** No `if (process.env.TEST)` branches, no test-specific exports, no test backdoors.
- **E2E must not rely on clean slate.** Tests must tolerate pre-existing data, prior test runs, and shared environments.

## Execution guidance

### Preflight checks (before e2e)

1. Verify the target environment is reachable (health endpoint, ping).
2. Confirm required services are running (database, API, auth provider).
3. Validate test user / credentials exist and are functional.
4. Check for leftover state that could cause false failures; log it, do not fail on it.

### Deterministic fixtures

- Use seeded randomness for generated data (seeded faker, deterministic UUIDs).
- Fixtures should be self-contained; avoid cross-test fixture dependencies.
- Prefer factory functions over shared mutable fixture objects.

### Async handling

- Poll with bounded timeout and backoff; never use fixed `sleep`/`waitForTimeout`.
- Set explicit timeout per operation; fail fast with a descriptive message on timeout.
- Bound retry attempts (e.g., max 3 retries with exponential backoff).
- Use framework-native waiting (Playwright `expect`, async assertions) over manual loops.

### Flake handling

- **Single infrastructure retry** per test run; if it fails twice, it is not flake.
- On retry failure, collect diagnostics: screenshots, network logs, service health, timestamps.
- Classify the failure (flaky / outdated / bug) before attempting a fix; a classification that waives or defers anything lands as a dated provisional Decision.
- Never add arbitrary delays or retry loops as a flake "fix."

### Failure attribution (before waiving anything)

- **A failure that only reproduces on your branch is yours.** No "pre-existing" or "environmental" waiver without reproducing the failure at the base commit — a control worktree at the merge base is the cheap, decisive check.
- **Proven-pre-existing failures get recorded, not skipped.** Add the failure to the campaign's LOOP.md "Known pre-existing failures" section when a charter exists (else the repo's known-flakes note), with its repro command and evidence; future waivers cite the entry instead of re-litigating.
- **An empty or erroring query is not evidence of absence.** Enumerate the namespace first (list the tests, count the files, query totals) and validate the query shape against a known-present row before concluding "not found."
- **Cross-subsystem changes run every touched side's harness.** A change spanning two toolchains is unverified until both sides' suites ran, no matter how green one side is.

### When the verifier itself breaks

- **Liveness-check before killing** a slow verifier run: is it progressing (log output, CPU, intermediate artifacts)? Killing a run seconds before completion costs a full rerun.
- **Cap restarts of a structurally failing verifier at 2.** Then stop retrying and record the failure output as evidence. A next-cheapest independent gate (targeted suite, isolated file run, control-worktree differential) may stand in for the objective harness — but the done claim names the substitution; the substitute is not the named floor. A genuinely unavailable independent oracle is a clean stop plus handoff, never substituted.
- **Wait event-driven with a timeout** — watch modes, CI wait commands, background completion notifications.
- **Never bypass a gate.** `--no-verify` and equivalents are never a shortcut (doctrine law); a gate that is wrong gets fixed, or waived by the human at the boundary — never bypassed in-flight.

## API surface discovery

Before generating test cases:
- Read the module source to enumerate exports/public functions.
- Confirm scope from the user request and inspected code context; if ambiguous, state assumptions and proceed conservatively.
- For each function: input types/constraints, output shape, error modes, invariants.
- Probe for state dependencies and ordering constraints between functions.

## Output format

Use markdown. Produce three sections:

**Test Strategy** -- one bullet per layer (unit/integration/e2e) naming the functions/flows and their coverage type.

**Test Matrix** -- table per function: columns `ID | Category | Name | Input | Expected`. Case ID scheme: `{CATEGORY}-{NN}` (HP, BV, ERR, EDGE). Append-only; never renumber.

**Implementation Plan** -- ordered steps: fixtures, unit tests, integration tests, e2e flows, run command.

## CI guidance

### Fast PR smoke lane

- Unit tests + linting + type-check on every PR.
- Subset of integration tests covering critical contracts.
- Target: under 5 minutes.

### Nightly full lane

Full unit + integration + e2e suite with higher property-based iteration counts. Flag tests that pass on retry but failed initially.

## Workflow

1. Spec or code defines the module behavior (types, constraints, API surface).
2. This skill produces the test strategy, matrix, and implementation plan.
3. The driver or a dispatched worker translates the plan to runnable tests, observed red before the implementation lands.
4. Implementation proceeds to green.
5. If implementation reveals missing cases, propose them first; append to spec only when explicitly requested.
