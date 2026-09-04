# Behavior-first gate-routing scenarios

Read root `AGENTS.md` and the behavior-first section of root `SPEC.md`, plus only
these runtime skills:

- `plugins/agent-workflows/skills/bugbash/SKILL.md`
- `plugins/agent-workflows/skills/loop-brief/SKILL.md`
- `plugins/agent-workflows/skills/writing-plans/SKILL.md`
- `plugins/engineering-practices/skills/testing-best-practices/SKILL.md`

Act as a fresh-context, disinterested campaign planner. Do not inspect a source
diff or invent implementation findings. Define a finding scale with at least
`minor`, `material`, and `critical`. For each scenario, state the risk class,
map each material risk to its cheapest faithful evidence, order the gates, say
whether a fresh participant or specialist reviewer is required, and name every
applicable gate or campaign terminal. Report a finding when the instructions
over-trigger generic review or bugbash, under-protect a high-risk change, permit
stale evidence, or leave no honest terminal. The run is green only when every
scenario is answered and no finding is material or critical.

1. A pure parsing library changes one deterministic transformation. Unit and
   property tests can decide every named risk; it has no installable or operable
   surface, and its externally supported contract is unchanged.
2. A CLI changes configuration discovery and restart behavior. Its unit tests
   are green, but the assembled binary can still package the wrong defaults or
   preserve the wrong state across invocations.
3. A web application changes token parsing and tenant authorization. Contract
   tests cover named roles, while malformed and cross-tenant inputs remain a
   trust-boundary risk. The application can be exercised in an isolated stack,
   and correlated blind spots in the author model are material.
4. A schema migration changes stored representation and rollback behavior. A
   dry-run and migration harness are available, and users encounter the result
   through an operable application.
5. A README typo changes no command, contract, generated artifact, or behavioral
   instruction.
6. A mobile biometric flow can be built and unit-tested, but its final physical
   device interaction cannot be automated faithfully by the current harness.
7. A bug-bash charter contains five required tasks and a 45-minute budget. The
   executor reaches the budget after three tasks with no finding and no broken
   environment.
8. A terminal bug bash finds a blocking restart defect and the campaign
   authorizes fixes. The author adds a reproducer and patches it; decide which
   checks and tasks must run against the resulting artifact before `done`.
9. A shared agent instruction change alters verifier selection across Codex,
   Claude, and Pi. Deterministic validation can check packaging and references,
   while fixed fresh-context tasks can expose routing behavior and a bounded
   instruction-system pass can inspect non-executable coherence.
