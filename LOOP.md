---
loop: 1
id: agent-profile-recall-skill-census
objective: Replace the Claude-only skill detector with a fail-closed, catalog-aware Recall wrapper.
status: active
phase: BOUNDARY
iteration: 3
iteration_budget: 5
updated_at: 2026-08-30T20:52:36Z
mission: cross-harness-skill-census
targets:
  spec: [REQ-CENSUS-001, REQ-CENSUS-002, REQ-CENSUS-003, REQ-CENSUS-004, REQ-CENSUS-005, REQ-CENSUS-006, REQ-CENSUS-007, REQ-CENSUS-008]
  mission: [CENSUS-003]
gates:
  - id: targeted
    run: npm test -- --run tests/skill-usage.test.ts
    green: Fake-Recall tests prove canonicalization, option forwarding, diagnostics, and every fail-closed condition.
    state: green
  - id: check
    run: npm run check
    green: TypeScript and all Vitest tests pass.
    state: green
  - id: validate
    run: ./scripts/validate.sh
    green: Plugin, manifest, skill, hook, and package validation passes.
    state: green
units:
  - id: U1
    title: Specify the Recall wrapper and establish red fake-Recall contract tests.
    targets: [REQ-CENSUS-001, REQ-CENSUS-002, REQ-CENSUS-003, REQ-CENSUS-004, REQ-CENSUS-005, REQ-CENSUS-006]
    state: done
  - id: U2
    title: Implement catalog canonicalization, coverage validation, and reporting.
    targets: [CENSUS-003]
    state: done
  - id: U3
    title: Pass full verification and independent review, then publish without version changes.
    targets: [REQ-CENSUS-007, REQ-CENSUS-008]
    state: current
decisions:
  - date: 2026-08-30
    call: Keep afk public and make no archival or renaming changes in this campaign.
    status: ratified
  - date: 2026-08-30
    call: Treat writing-plans only as a leading candidate until complete-fleet evidence exists.
    status: ratified
  - date: 2026-08-30
    call: Keep both plugin versions at 3.0.0 because this changes analytics tooling, not skill bodies.
    status: ratified
blockers: []
boundary:
  - publish
  - merge-tracked-ref
---

# Loop: catalog-aware Recall skill census wrapper

## State

- Branch `feat/recall-skill-usage` starts from released agent-profile `3.0.0`.
- Baseline `scripts/skill-usage.sh` embeds a Claude transcript parser, accepts `--root`, and labels coverage as Claude Code only.
- Baseline tests inject Claude JSONL transcripts and cannot exercise Recall failures, fleet coverage, or cross-harness canonicalization.
- Red evidence: all 15 fake-Recall contract tests fail against the baseline transcript parser.
- Current targeted evidence: all 15 fake-Recall contract tests pass after replacing transcript parsing with the catalog-aware wrapper.
- The first independent review rejected one medium defect: exact and bare aliases could collapse within one source/host, making summed sessions non-distinct. Three regressions were observed red before the fix.
- Final verifier evidence: `npm run check` passes 43 tests across four files; `./scripts/validate.sh` passes manifest parity, release tags, package wiring, hooks, and all 41 declared skills; `bash -n`, `missionctl context`, and `git diff --check` pass.
- Independent re-review approves with no medium-or-higher findings.
- No skill is archived or renamed in this campaign; plugin manifests remain at `3.0.0`.

## Known pre-existing failures — do not chase (cited evidence only)

- None established.
