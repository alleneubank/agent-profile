# Engineering-practices doctrine scenarios

Read `plugins/engineering-practices/SPEC.md`, `BRIEF.md`, and only these runtime
skills:

- `skills/testing-best-practices/SKILL.md`
- `skills/code-law/SKILL.md`

Act as a fresh-context, disinterested reviewer. Define a severity scale with at
least `minor`, `material`, and `critical`. For each scenario, state the decision
the skills require and cite the exact controlling passage. Report a finding when
the skills are silent, contradictory, or forbid a legitimate neighboring
behavior. Approve only when no finding is material or critical.

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
