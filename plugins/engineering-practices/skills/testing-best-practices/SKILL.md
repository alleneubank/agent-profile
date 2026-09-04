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
- **Risk first, harness before judgment** — list the material product risks and
  map each to the cheapest evidence that can expose it. Floors gate the
  interior; never outsource to a person or generative critic what a
  deterministic check can decide. Use a task-based dogfood or bug bash when the
  risk lives in assembled behavior. Use specialized review only for a named
  property that execution cannot decide.
- Few, well-crafted, broad-coverage: build the surface's harness, not the
  task's check — the next feature reuses it for free. Build cheap verifiers
  freely; propose expensive ones. A deterministic harness proves known
  contracts; an operable product's assembled surface is the final pre-boundary
  gate when lower layers cannot expose the risk. A loop needing live secrets to
  verify is built at the wrong altitude.
- Realism: integration over mocked units for data flow and permissions; use the
  dependency-fidelity order under Integration / contract tests. Visual/UI floors
  are the change observed on the live surface. Before done: would this survive a
  manual walkthrough?

## Test layering policy

Choose scope by the contract and the trade among **speed, maintainability,
utilization, reliability, and fidelity**. No pyramid shape or layer count is
universally correct. Improve any dimension that does not make another worse;
spend slower, broader tests where their fidelity catches risks a smaller test
cannot.

### Unit tests

Purpose: verify public behaviors and invariants at a small, precise boundary.
Do not assume one test per method or one test suite per implementation-detail
class; test a detail directly only when its complexity or diagnostic precision
earns the coupling.

- **Data-driven**: use a parameterized table when every row is the same behavior
  with the same setup, action, assertion shape, and failure interpretation.
  Vary independent input dimensions independently unless their interaction is
  the contract. Give distinct scenarios or outcomes, especially different error
  contracts, separate tests even when a table would be shorter.
- **Property-based**: fuzz invariants that must hold across all inputs (e.g., idempotency, sort stability, roundtrip serialization).
- **Cross the boundary**: cover the transition from valid to invalid, not just samples of each — where data moves across the valid/invalid line is where the bugs live.

### Integration / contract tests

Purpose: verify interactions between components and external services.

- **API envelope**: request/response shape, status codes, content types, pagination.
- **Error contract**: error codes, error shapes, rate limiting, retries.
- **Auth and scoping**: token validation, role-based access, tenant isolation.
- **Eventual consistency**: verify convergence within bounded time; poll rather than sleep.
- Reuse auth state across tests where possible; avoid redundant login flows.
- Prefer, in order, the real dependency; a service-owner fake or hermetic local
  server; a mock of an interface you own. Do not invent a third party's fake or
  mocked contract. If no faithful implementation is practical, wrap that API in
  an interface you own and test the wrapper against the real contract.
- Prefer a shared behavioral contract suite that runs against both the real
  implementation and its fake. Without conformance evidence, name fake drift as
  a risk rather than assuming equivalence.

### E2E tests

Purpose: verify real user workflows through the full stack.

- Exercise the real path and the highest-fidelity practical dependencies.
- Keep the suite small: cover each important user workflow and one representative
  of each important error class. Lower layers carry variations that do not need
  the full stack.
- **Hermetic environments**: provision isolated, ephemeral state and dispose of
  it after the run; a clean namespace is a declared input, not an ambient
  assumption.
- **Shared environments**: use unique data, discover and tolerate prior state,
  and make flows idempotent rather than depending on cleanup or a clean slate.
- **Flow-oriented**: validate real data paths end-to-end rather than isolated assertions.

## Hard rules

A test is a **second, independent statement of the contract**. Every rule below
follows from that: where the test stops being independent of the code it grades,
it stops being a test and becomes a mirror.

- **Name the scenario and outcome, not merely the method.** A failure should say
  what condition was exercised and what behavior broke. One test covers one
  scenario; one behavior may span methods and one method may need several tests.
- **Make relevant details explicit and hide only noise.** Keep cause next to
  effect. Builders and helpers may supply irrelevant boilerplate, but a test
  writes every value or condition its expectation depends on even when it matches
  a helper default. Prefer descriptive and meaningful phrases (DAMP) to DRY
  indirection when readability and uniqueness conflict.
- **Expected values are written down, not computed.** A test that derives its
  expectation the way the implementation does passes by construction, and keeps
  passing when both sides are wrong. Write the literal. The same failure at a
  larger scale is a mock that grows into a simulator — past that point the suite
  measures the simulator.
- **Assertions are narrow and actionable.** Assert the field, property, or
  interaction the behavior promises instead of incidental full-object equality.
  Use literal, non-default, discriminating values, varying them where a swap,
  reuse, or missing write must be exposed. The test name plus failure output is
  enough to begin investigation.
- **Tests assert observable behavior, not the call sequence that produced it.**
  Mocking every collaborator and verifying the calls in order restates the
  implementation in a second syntax — a change detector: it reddens on
  behavior-preserving refactors of the code it mirrors, and a correct and an
  incorrect implementation are equally likely to pass it. The tell is mechanical
  maintenance: one edit applied across many tests to keep a no-op change green.
  Such a test is negative value, not neutral — rewrite it against the outcome or
  delete it. An interaction assertion is legitimate only where the interaction
  *is* the contract (a retry budget, an audit emission, an exactly-once side
  effect), and then it names the guarantee, not the call.
- **Never invent signatures, source locations, or line numbers.** Only reference what you have read from the codebase.
- **No fabricated fixtures.** Derive test data from actual schemas, types, or seed data in the repo.
- **No test-only runtime behavior or backdoors in product code.** A branch such
  as `if (process.env.TEST)` that changes product behavior is a defect in the
  test setup. Legitimate production design may include explicit dependency
  injection, package-scoped seams, stable automation IDs, or an interface with
  the test as a real consumer; the seam must preserve or improve the production
  contract rather than weaken it.
- **Observe red.** A new test fails for the expected reason before the production
  change makes it green; a compile failure counts when it proves the missing
  contract. While refactoring test code, deliberately break the behavior under
  test and keep the expected failure present so a deleted assertion cannot pass
  silently; restore production behavior and finish green.

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
- Use the test framework's native waiting and async assertions over manual loops.

### Flake handling

- Use at most one infrastructure retry as a diagnostic probe, not a verdict. A
  pass does not prove flake and two failures do not prove determinism; locate the
  uncontrolled input and decide whether it belongs to product, test, or
  environment.
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

## Contract and risk discovery

Before generating checks:
- Read the SPEC, public surface, and user request to enumerate promised
  behaviors, invariants, important failure modes, and state transitions.
- Name the highest-impact ways the change could harm a user or operator,
  including risks no code-coverage metric can see.
- Confirm scope from inspected context; state conservative assumptions when
  ambiguity is not load-bearing.
- Map each contract or risk to the cheapest faithful mitigation: type or static
  check, unit/property test, integration contract, E2E flow, task-based
  dogfood/bug bash, telemetry, or a named specialized review.
- Use coverage only after designing the checks, as a clue to missed paths; never
  use a percentage as evidence that the risk is covered.

## Output format

Use markdown. Produce only the layers the QA design actually needs:

**QA Design** -- table with `Risk or contract | Impact | Evidence | Why this is the cheapest faithful check`.

**Test Cases** -- for checks that become tests, use `ID | Scope | Scenario | Input/state | Expected`. Case IDs are append-only; do not organize the matrix by function unless the function is itself the public contract.

**Execution Plan** -- ordered red/green/refactor steps, exact commands, and any
task-based bug bash or telemetry gate. A layer with no material risk to cover is
omitted rather than filled ceremonially.

## CI guidance

### Fast PR smoke lane

- Unit tests + linting + type-check on every PR.
- Subset of integration tests covering critical contracts.
- Target: under 5 minutes.

### Nightly full lane

Full unit + integration + e2e suite with higher property-based iteration counts. Flag tests that pass on retry but failed initially.

## Workflow

1. Spec or code defines the module behavior (types, constraints, API surface).
2. This skill produces the QA design, selected test cases, and execution plan.
3. The driver or a dispatched worker translates the plan to runnable tests,
   observed red before the implementation lands.
4. Implementation proceeds to green; apply the code-health law, refactor while
   green, then rerun the affected verifier.
5. Exercise an operable assembled surface through the declared E2E or bug-bash
   tasks when the QA design selected that evidence.
6. If implementation reveals missing cases, propose them first; append to spec
   only when explicitly requested.
