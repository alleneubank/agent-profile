# Mission-command schema v1

Read this reference when creating or repairing a typed mission or campaign.

## Mission frontmatter

```yaml
mission_control: 1
id: stable-mission-id
title: Finite measurable outcome
kind: delivery
status: active
owner: accountable-owner
rubric:
  - id: OUTCOME-001
    dimension: contract-acceptance
    criterion: The intended outcome in plain language.
    measure: The observation that decides the floor.
    floor: The minimum passing result.
    evaluator: harness
    evidence_type: verifier-run
    freshness: P7D
boundaries: [publish]
evidence: []
```

Mission states are `draft`, `active`, `paused`, `achieved`, and `abandoned`.
Achievement requires current admissible evidence for every required floor.
Evidence states `unknown` and `stale` are projections, not stored results.

## Kind guide

Choose the kind by the outcome, not the repository or team:

| Kind | Use when the outcome is | Required dimensions |
|---|---|---|
| delivery | a product or contract lands | contract-acceptance, quality-bar, integration-e2e, operability, landing-readiness |
| operations | a live state changes or stays healthy | health, safety, reversibility, observability, post-change-observation |
| research | a question becomes decision-ready | question-resolution, evidence-quality, alternative-explanations, reproducibility, decision-usefulness |
| maintenance | a bounded inventory closes and recurs less | bounded-inventory, closure-evidence, regression-prevention, recurrence-reduction |
| administrative | a correct artifact, approval, or deadline state is obtained | outcome-artifact, dependency-deadline-state, privacy-compliance, required-approval |
| training | demonstrated capability transfers and persists | recall, application, novel-transfer, retention-performance |

Numeric progress is valid only when the mission defines a meaningful numerator
and denominator. There is no cross-mission score.

## Campaign frontmatter

```yaml
mission_control: 1
mission_id: stable-mission-id
campaign_id: bounded-attempt-id
objective: Advance named floors through one attempt.
status: active
phase: TDD
iteration: 1
iteration_budget: 8
targets: [OUTCOME-001]
attention: none
next_action: Run the failing verifier.
expected_signal_by: 2026-09-01T18:00:00Z
updated_at: 2026-08-28T18:00:00Z
head: abc123
review_capacity:
  measure: changed-contract surfaces
  limit: one reviewed unit at a time
evidence: []
```

Cross-repository campaigns also declare:

```yaml
mission_source:
  repository: https://example.com/owner/repository.git
  ref: main
  path: MISSION.md
```

Campaign states are `planned`, `active`, `waiting`, `blocked`, `done`,
`budget-exhausted`, and `superseded`. Keep `waiting` for a declared external
signal and `blocked` for an exhausted ladder requiring a decision.

## Evidence

Mission evidence includes `rubric_id`, `campaign_id`, `evaluator`,
`evidence_type`, stored `result` (`passing`, `failing`, or `waived`), UTC
`timestamp`, and `commit` or `artifact_ref`. Campaign evidence has the same
shape without `campaign_id`, which the campaign supplies.

Only evidence matching the exact rubric ID, evaluator, and evidence type may
change its state. The newest admissible record wins. A rubric or evidence
freshness duration makes expired evidence `stale`; stale evidence cannot keep a
mission green. Point to executable machine-readable artifacts or immutable
external results. Do not commit prose sidecars that narrate verifier output,
review history, or rollout status; CI, the pull request, and git own that
history.
