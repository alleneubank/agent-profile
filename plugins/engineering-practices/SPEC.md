# SPEC — engineering-practices doctrine

The engineering-practices plugin turns reusable engineering judgment into
portable skills. Blanket testing and code-health rules lose important context:
parameterized cases can hide distinct behaviors, mocks can replace higher-fidelity
contracts, happy-path-only E2E can miss critical failures, and absolute style rules
can forbid clear code. The solution is a compact distillate of the settled guidance
in [`eng-wiki`](https://github.com/alleneubank/eng-wiki) that preserves strong
rules while naming the tradeoffs and exceptions that change an agent's decision.

## Domain model

- A **skill contract** is the behavior implied by a skill's trigger and body.
- A **testing strategy** selects test scope and doubles by the contract being
  proven and the speed, maintainability, utilization, reliability, and fidelity
  tradeoffs.
- **Code law** is reusable craft judgment whose violations are caught by a
  harness or behavior-first gate; unrecoverable boundary law remains in
  `AGENTS.md`.
- A **scenario oracle** gives a fresh-context task runner fixed engineering
  choices and observes whether the skills produce the intended judgment without
  access to the author's reasoning.

## Requirements

- **REQ-DOCTRINE-001 — Testing strategy:** `testing-best-practices` chooses test
  scope by explicit quality tradeoffs, favors the highest-fidelity practical
  dependency, and distinguishes homogeneous table cases from behaviorally
  distinct tests.
- **REQ-DOCTRINE-002 — Test integrity:** testing guidance requires actionable
  scenario/outcome tests, literal and discriminating expectations, narrow
  assertions, observed red for new tests, and deliberate red while refactoring
  test code.
- **REQ-DOCTRINE-003 — End-to-end scope:** E2E guidance covers important user
  workflows and important error classes while keeping the suite small; hermetic
  runs prefer ephemeral state and shared environments require idempotent,
  state-tolerant flows.
- **REQ-DOCTRINE-004 — Code structure:** `code-law` governs cognitive load,
  hard-to-misuse interfaces, safe defaults, narrow failure regions, precise
  naming and comments, and evidence-based abstraction.
- **REQ-DOCTRINE-005 — Portability and parsimony:** both skills remain
  harness-agnostic, self-contained, and concise; `eng-wiki` is provenance rather
  than a runtime dependency.
- **REQ-DOCTRINE-006 — Verification:** fixed scenarios are observed red against
  the prior skills and pass a fresh-context task run after the revision; the
  repository's mechanical gates remain green.
- **REQ-DOCTRINE-007 — Risk-driven QA:** test planning starts from public
  contracts and material product risks, maps them to the cheapest faithful
  evidence, treats coverage as a gap-discovery clue, and does not require a
  matrix per function or a ceremonial entry in every test layer.
- **REQ-DOCTRINE-008 — Causal diagnosis and seams:** retry outcome alone never
  classifies a flake; the owner of nondeterminism is located. Runtime test
  backdoors remain forbidden while explicit dependency injection,
  package-scoped seams, stable automation IDs, and behaviorally conformant fakes
  remain legitimate.
- **REQ-DOCTRINE-009 — Applicable law and incremental change:** code properties
  apply where their failure modes exist; configurable choices are distinguished
  from fixed invariants; plans include post-green refactoring and an independently
  green prefactor unit when existing structure fights the behavior change.

## Invariants

- `AGENTS.md` continues to own only unrecoverable or always-loaded law.
- Tests assert observable contracts; call-sequence assertions remain valid only
  when the interaction is itself the contract.
- Guidance states the weakest rule that excludes the demonstrated failures and
  preserves named legitimate behavior.
- Coverage percentage is never completion evidence, and intermittent behavior is
  never classified solely from retry history.
- Skill names, descriptions, and discovery behavior remain stable.
- No version, tag, push, marketplace publication, or other release action occurs
  in this campaign.

## Non-goals

- Rewriting language-specific or workflow skills.
- Copying or citing private local paths from the wiki into runtime instructions.
- Building an LLM-backed test runner into the deterministic repository harness.
- Publishing engineering-practices 2.0.0.

## Decisions

- Testing and code law form one campaign because the selected scope is the
  combined eng-wiki doctrine distillate. (2026-08-29, ratified)
- The two existing skills are revised in place; no new runtime skill is created.
  (2026-08-29, ratified)
- Behavioral scenario execution complements, rather than enters, the
  deterministic `npm` and validation gates. (2026-08-29, ratified)
- The next published release is major because existing behavioral guidance
  changes incompatibly; release work remains a separate boundary action.
  (2026-08-29, ratified)

## Acceptance criteria

- [x] Fixed baseline scenarios reproduce every named guidance defect against the
      pre-change skills.
- [x] Revised testing guidance satisfies REQ-DOCTRINE-001 through
      REQ-DOCTRINE-003 without contradicting its hard rules.
- [x] Revised code law satisfies REQ-DOCTRINE-004 without duplicating `AGENTS.md`.
- [x] A fresh-context scenario runner reports no material-or-higher finding.
- [x] `npm run check` passes.
- [x] `./scripts/validate.sh` passes.
- [x] Fresh-context scenario execution covers REQ-DOCTRINE-007 through
      REQ-DOCTRINE-009 with no material-or-higher finding.

## Test traceability

- REQ-DOCTRINE-001 through REQ-DOCTRINE-005 — fixed behavioral cases in
  `tests/engineering-practices-scenarios.md`, independently approved with no
  findings.
- REQ-DOCTRINE-006 through REQ-DOCTRINE-009 — `npm run check`,
  `./scripts/validate.sh`, and the fixed scenario oracle.
