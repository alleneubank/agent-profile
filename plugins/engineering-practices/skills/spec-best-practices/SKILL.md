---
name: spec-best-practices
description: Use when creating, reviewing, updating, interviewing for, completing, or finding gaps in SPEC.md files, or entering the ADF SPEC gate.
---

## Modes

- Interview, complete, or find gaps in a `SPEC.md` → read the [interview workflow](references/interview.md) and apply it alongside the rules below.
- Create, review, or update a `SPEC.md` → use the rules below directly.

## Naming

Always `SPEC.md`. No exceptions for the primary spec file. Not `feature.spec.md`, not `SPEC-feature.md`.

Supporting documents linked from a `SPEC.md` TOC may use descriptive names (e.g., `commands.spec.md`), but only when a root `SPEC.md` exists and links to them.

## Placement

Specs are colocated with the code they describe: root `SPEC.md` for project scope, `apps/foo/SPEC.md` for app scope, `packages/bar/SPEC.md` for package scope.

- Avoid `spec/`, `docs/specs/`, and `docs/plans/` directories. Prefer colocated `SPEC.md` files.
- Plan documents are ephemeral. Absorb durable decisions into the relevant `SPEC.md` and delete the plan doc.
- When a spec gets long, add a TOC linking to adjacent supporting files (`./commands.spec.md`, etc.). Supporting files live alongside the `SPEC.md`, not in a subdirectory.

## Content

Specs are freeform markdown. No rigid template, no YAML frontmatter, no required section ordering. These elements must be present:

**Problem and solution** -- narrative context for why this system/feature exists. Lead with the problem.

**Domain model** -- types, relationships, data flow. For retroactive specs, derive from inspected code.

**Requirements with `REQ-*` IDs** -- every behavioral requirement gets a stable identifier. Format: `REQ-{DOMAIN}-{NNN}` (e.g., `REQ-AUTH-001`). Append-only; never renumber. Each requirement is testable and traceable.

**Invariants** -- conditions that must always hold.

**Non-goals** -- explicit scope boundary. What this spec intentionally does not cover.

**Decisions** (conditional) -- ratified calls and tradeoff policy for this surface. Grows as boundary batches are answered and provisional entries are ratified; entries marked ratified|provisional. Gives answered questions a durable home so they are never re-asked.

**Acceptance criteria** -- markdown checklist, not prose:

```markdown
- [ ] Auth endpoint returns JWT with tier claim
- [ ] Rate limiter rejects >100 req/min per IP
```

**Risk tags** (conditional) -- flag high-risk items (schema migrations, auth changes, public API contracts, infra changes) when those risks exist or the ADF `PLAN` gate requires approval.

**Test traceability** (conditional) -- `REQ-*` to test file:line mapping. Added during/after TDD, not at initial authoring. The mapped test asserts the requirement, not the code that implements it -- a test traceable only to a call sequence proves the implementation exists, not that the requirement holds.

## Authoring rules

**Evidence-based**: read code before writing spec content. Do not invent behavior, signatures, or file paths. For retroactive specs, derive requirements from the actual implementation.

**Calibrate claim strength to enforcement**: match absolutist words ("unrepresentable", "cannot", "structurally caught", "any regression trips the check") to what the check actually proves. If a reviewer can construct a counterexample in under 60 seconds (comment decoy, string literal, shadowed binding, computed path), the SPEC is overclaiming. Either tighten the check, narrow the claim (e.g., "closes the literal-spawn regression; comment/string/shadow-binding cases are covered by the companion test"), or record the gap as an open item. Conservative phrasing backed by evidence beats strong phrasing that invites reject cycles.

**Retroactive specs are first-class**: documenting existing behavior is valid and encouraged. Read the implementation, extract requirements from actual behavior, note inconsistencies as open items (not silent omissions), map traceability to existing tests.

**External-API integrations**: before locking requirements for an integration with an external provider, run a recall sweep for prior findings on that provider/API and fetch the provider's current docs — do not spec against remembered API shapes; deprecations and legacy endpoints invalidate them. Treat unexplained existing config (keys, scopes, endpoints) as an investigation trigger, not dead code.

**Mutation policy**: the spec is the human+agent contract — do not reshape it without direction, and a component the spec does not name is a scope change, not an implementation detail. A reversible interior call that refines spec territory may land as a dated provisional Decisions entry, ratified at the boundary. When spec/implementation drift is found, surface it immediately — the user decides whether to update spec or code.

**Spec vs. plan**: specs describe what and why; plans describe how and when. Plans are ephemeral. Absorb durable decisions into the spec; delete the plan doc.

## Lifecycle

**Creation (SPEC gate)**: the gate passes when the colocated `SPEC.md` carries `REQ-*` IDs, invariants, non-goals, and acceptance criteria — plus risk tags whenever high-risk items exist. Determine placement, read the existing file and identify gaps (or create at the correct colocated path), and ensure every required element is present before PLAN begins.

**Maintenance**: update spec when behavior changes; append new `REQ-*` IDs, never renumber; add test traceability as tests are written; cross-check spec against implementation whenever both are in context and surface drift.

**Retirement**: when a feature is removed, remove or archive its `SPEC.md`. Do not leave stale specs describing deleted behavior.
