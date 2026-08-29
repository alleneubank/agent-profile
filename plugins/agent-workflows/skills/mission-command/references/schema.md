# Loop and mission schema

Read this reference when authoring or repairing a `LOOP.md` or a
`.mission/mission.yaml`. `missionctl check` is the authority; this page is the
human-readable summary of its grammar.

## LOOP.md

YAML frontmatter followed by a free Markdown body. The body is working notes;
missionctl preserves it byte-for-byte and only removes `## ` sections through
`compact`/`close` dispositions.

```yaml
---
loop: 1
id: widget-pagination
objective: Ship cursor pagination for widget listing behind the existing API.
status: active            # planned | active | waiting | blocked | done | budget-exhausted | superseded
phase: TDD                # MISSION | SPEC | PLAN | TDD | DEV | E2E | BOUNDARY (optional)
iteration: 3              # default 0; never exceeds iteration_budget
iteration_budget: 8
updated_at: 2026-08-29T12:00:00Z          # optional
expected_signal_by: 2026-09-01T18:00:00Z  # required when waiting
mission: regional-rollout                 # optional; or { id, source: { repository, ref, path } }
targets:
  spec: [REQ-WIDGET-002]  # each must appear in the nearest SPEC.md
  brief: [Correctness]    # each must be a "- Name:" floor under ## Floors in the nearest BRIEF.md
  mission: [REGION-002]   # each must be a rubric id in the linked mission
gates:                    # required, non-empty; state is what the driver last observed
  - { id: unit, run: npm test, green: all widget tests pass, state: red }   # unknown | red | green
units:                    # ordered work; at most one current
  - { id: U1, title: Cursor encoding helper, targets: [REQ-WIDGET-002], state: done }   # pending | current | done | deferred
  - { id: U2, title: List endpoint accepts cursor, state: current }
decisions:
  - { date: 2026-08-28, call: Cursors are opaque base64url strings., status: ratified }  # provisional | ratified
blockers:                 # required when blocked
  - { summary: Cursor spec ambiguous for empty pages, proposed: Return an empty page with a null cursor }
boundary: [publish, merge-tracked-ref]    # required, non-empty
---
```

Quote any prose value containing ` #` (`title: "Fix PR #12"`): YAML reads an
unquoted ` #` as a comment, and `check` warns `loop.comment-in-value` when a
free-text field lost its tail that way.

Every frontmatter string is one line (multi-line notes belong in the body);
unknown keys anywhere — top level or inside a gate, unit, decision, blocker,
or the mission link — are preserved on rewrite and warned about.

Rules `check` enforces: required fields present; enum membership;
`iteration ≤ iteration_budget`; unique gate and unit ids; at most one
`current` unit (an `active` loop without one is a warning); `blocked` needs a
blocker; `waiting` needs `expected_signal_by`; `done` needs every gate
`green`; targets resolve. Reads are tolerant — CRLF, BOM, quoted integers,
unknown fields (preserved, warned), a bare-string mission — and writes are
canonical.

## .mission/mission.yaml (optional)

```yaml
mission: 1
id: regional-rollout
title: Regional rollout of the widget service
outcome: Every region runs the widget service with cursor pagination.
rubric:
  - id: REGION-001
    criterion: Canary region runs the new build.
    floor: Canary health green for 24 hours.
    status: met                       # open | met | waived
    evidence: ci://rollout/canary/2026-08-27   # required when met; a reference, never a narrative
  - id: REGION-002
    criterion: All remaining regions run the new build.
    floor: Every region health green for 24 hours.
    status: open
boundary: [publish, production-cutover]
```

A loop in another repository links by `mission: { id, source: { repository, ref, path } }`;
missionctl resolves it from a sibling checkout (`<ancestor>/<repository name>/<path>`),
never over the network, and warns `mission.unavailable` when none is present.

A mission is achieved when every rubric item is `met` or `waived`. Campaigns
are discovered, not listed: `missionctl mission` walks the directory below
`.mission/` for loops whose `mission.id` matches. Nothing else is stored.

## Lifecycle plans

`compact prepare` and `close prepare` emit a plan:

```json
{ "plan": 1, "transition": "compact", "loop_path": "...", "source_sha256": "...",
  "items": [ { "id": "unit:U1", "kind": "unit", "summary": "U1 Cursor encoding helper [done]",
               "allowed": ["drop", "keep"], "proposed": "drop", "disposition": null, "reason": null } ] }
```

Fill `disposition` for every item (and `reason` or `evidence` where the
disposition requires it), then `validate` and `apply`. A changed loop
(`plan.stale-source`), a missing or disallowed disposition, or a routing
target without a `SPEC.md`/`BRIEF.md` refuses the apply; nothing is deleted
until its destination exists.

## Commands

```
missionctl check | context | statusline | repair [--dry-run] | inspect | adopt [--write]
missionctl compact prepare|validate|apply [--plan FILE|-]
missionctl close   prepare|validate|apply [--plan FILE|-]
missionctl mission
missionctl harness claude session-start
```

All commands take `--root DIR`, `--now TIMESTAMP`, and `--json`.
