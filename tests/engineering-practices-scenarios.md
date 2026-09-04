# Engineering-practices doctrine scenarios

Read `plugins/engineering-practices/SPEC.md`, `BRIEF.md`, and only these runtime
skills:

- `skills/testing-best-practices/SKILL.md`
- `skills/code-law/SKILL.md`

Act as a fresh-context, disinterested engineer completing these tasks. Do not
perform a line-by-line review of the skill prose. Define a finding scale with at
least `minor`, `material`, and `critical`. For each scenario, make the decision
the task requires and cite the controlling passage you actually used. Report a
finding when the skills are silent, contradictory, or forbid a legitimate
neighboring behavior. The run is green only when no finding is material or
critical.

1. A unit-test planner has four cases spanning a happy path, a boundary, two
   distinct error behaviors, and two independent input dimensions. Decide when a
   parameterized table remains appropriate and when separate scenario/outcome
   tests are required.
2. An integration test for a third-party service can run either a hermetic local
   server or an owner-provided fake. Choose among the real implementation, that
   fake, and a mock; address who may define the fake or mocked contract.
3. A permission failure is an important user-visible workflow. Decide whether it
   earns E2E coverage and how to keep the E2E suite bounded.
4. A helper refactor in test code may accidentally delete an assertion. State how
   the test's ability to fail is proved before and during the refactor.
5. A test uses a default-like value, full-object equality, hidden fixture
   defaults, and a name that mentions only the method. Identify the minimum
   changes needed for an actionable, independently checkable failure.
6. Code uses the established abbreviation `RPC`, a comment explaining a
   non-obvious ordering constraint, nested exceptional paths, an unsafe default
   for a destructive flag, and two coincidentally identical domain checks.
   Decide what stays and what changes without imposing blanket rules.
7. A planner proposes one unit test for every exported function, a complete
   unit/integration/E2E matrix, and an 85% coverage floor for a change whose main
   risks are a compiled asset missing from the release bundle and loss of state
   across restart. Replace it with the smallest faithful QA design and explain
   what role, if any, coverage retains.
8. An end-to-end test fails once, passes on retry, then fails twice on another
   host. A trace shows the product and the test share an uncontrolled clock, and
   a separate run suggests a product data race. Decide what can be classified,
   what evidence is still needed, and why retry count is not the verdict.
9. A UI team proposes a stable automation ID, a package-scoped constructor seam,
   an `if TEST` runtime branch, and a home-grown fake for a third-party service.
   Decide which seams are legitimate, reject the actual backdoor, and state what
   would establish that a fake conforms to the real contract.
10. A retryable reconciliation command writes external state, while a pure
    formatting helper has no side effects. Existing structure tangles the
    requested feature with an unrelated migration. Decide which system
    properties apply to each surface and how to sequence prefactoring,
    red/green implementation, post-green refactoring, and verification without
    forcing an invalid intermediate state.
