---
loop: 1
id: agent-profile-recall-skill-census
objective: Replace the Claude-only skill detector with a fail-closed, catalog-aware Recall wrapper.
status: active
phase: BOUNDARY
iteration: 4
iteration_budget: 5
updated_at: 2026-08-30T22:44:30Z
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
    state: done
  - id: U4
    title: Close the production alias-session gap and capture complete all-time and recent fleet evidence.
    targets: [REQ-CENSUS-005, REQ-CENSUS-006, REQ-CENSUS-008, CENSUS-003]
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
  - date: 2026-08-30
    call: When exact and bare aliases overlap within one host/source, preserve exact invocation totals and report honest distinct-session union bounds unless the population proves an exact union.
    status: provisional
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
- The first published fail-closed implementation rejected the real all-time fleet census because historical exact and bare aliases coexist for 34 of 41 declared skills. The all-time query failed before `never_fired` on `agent-workflows:afk`, proving the production gap without emitting a false result.
- Two alias-session regressions were observed red. The wrapper now sums invocations exactly, emits an exact session count when population bounds collapse, and otherwise emits `sessions: null` with inclusive `session_bounds`; 19 targeted tests pass.
- Real fixed-tree evidence covers `aem5`, `ae-dev`, `pixelproton`, `fll-practice`, and `onyx` plus all five harness sources. Both all-time and 30-day reports contain 41 fired skills and no `never_fired` skills; `writing-plans` and `afk` both fired in both windows.
- The production-fix review rejected one high defect in cross-group population bounds and one medium test gap. Three reviewer regressions were observed red; the aggregate now caps at the global population, rejects impossible minima before `never_fired`, and verifies text range rendering.
- The production-fix re-review rejected a second high defect: `--plugin` skipped aggregate validation for canonical rows outside the selected report population. One regression was observed red; all canonical rows are now validated before plugin filtering.
- Final verifier evidence: `npm run check` passes 48 tests across four files; `./scripts/validate.sh` passes manifest parity, release tags, package wiring, hooks, and all 41 declared skills; `bash -n`, `missionctl context`, and `git diff --check` pass.
- The initial implementation's independent re-review approved with no medium-or-higher findings; the final production-fix re-review approves with no findings.
- No skill is archived or renamed in this campaign; plugin manifests remain at `3.0.0`.

## Known pre-existing failures — do not chase (cited evidence only)

- None established.
