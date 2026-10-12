---
name: spec-best-practices
description: Use when creating, reviewing, updating, interviewing for, completing, or finding gaps in SPEC.md files.
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

Specs are freeform markdown. No rigid template, no YAML frontmatter, no required section ordering. Only guarantees are normative; everything else is notes, held to a budget of 1,500 words per spec, supporting files included. Over budget, move behavior into guarantees and their checks, and cut what the code or tests already say. These elements must be present:

**Problem and solution** -- narrative context for why this system/feature exists. Lead with the problem.

**Domain model** -- types, relationships, data flow. For retroactive specs, derive from inspected code.

**Guarantees with `REQ-*` IDs** -- every behavioral requirement and invariant gets a stable identifier. Format: `REQ-{DOMAIN}-{NNN}` (e.g., `REQ-AUTH-001`). Append-only; never renumber. Each guarantee names the check that holds it: a test, a property, or a model invariant where state has history. Name it so a reader can find and run it; a test whose name carries the ID and the rule lets the spec line stay one sentence. The check asserts the guarantee, not the code that implements it -- a check traceable only to a call sequence proves the implementation exists, not that the guarantee holds. A guarantee with no check that runs is marked `unchecked`. A rule no check can hold is deleted or marked `unchecked`, never left as normative prose.

**Non-goals** -- explicit scope boundary. What this spec intentionally does not cover.

**Decisions** (conditional) -- ratified calls and tradeoff policy for this surface. Grows as boundary batches are answered and provisional entries are ratified; entries marked ratified|provisional. Gives answered questions a durable home so they are never re-asked.

**Acceptance criteria** -- markdown checklist, not prose:

```markdown
- [ ] Auth endpoint returns JWT with tier claim
- [ ] Rate limiter rejects >100 req/min per IP
```

**Risk tags** (conditional) -- flag high-risk items (schema migrations, auth changes, public API contracts, infra changes) when those risks exist; shared AGENTS.md governs plan approval and specialist review.

## Authoring rules

**Evidence-based**: read code before writing spec content. Do not invent behavior, signatures, or file paths. For retroactive specs, derive requirements from the actual implementation.

**Calibrate claim strength to enforcement**: match absolutist words ("unrepresentable", "cannot", "structurally caught", "any regression trips the check") to what the check actually proves. If a reviewer can construct a counterexample in under 60 seconds (comment decoy, string literal, shadowed binding, computed path), the SPEC is overclaiming. Either tighten the check, narrow the claim (e.g., "closes the literal-spawn regression; comment/string/shadow-binding cases are covered by the companion test"), or record the gap as an open item. Conservative phrasing backed by evidence beats strong phrasing that invites reject cycles.

**Retroactive specs are first-class**: documenting existing behavior is valid and encouraged. Read the implementation, extract requirements from actual behavior, note inconsistencies as open items (not silent omissions), name the existing checks that hold each guarantee.

**External-API integrations**: before locking requirements for an integration with an external provider, run a recall sweep for prior findings on that provider/API and fetch the provider's current docs — do not spec against remembered API shapes; deprecations and legacy endpoints invalidate them. Treat unexplained existing config (keys, scopes, endpoints) as an investigation trigger, not dead code.

**Mutation policy**: the spec is the human+agent contract — do not reshape the agreed outcome without direction. A new app, service, or product capability outside that outcome changes scope; internal implementation choices within it remain the driver's. A reversible interior call that refines spec territory may land as a dated provisional Decisions entry, ratified at the boundary. When spec/implementation drift is found, investigate against existing authorization; surface unresolved contract changes for the human instead of silently changing the expected behavior.

**Spec vs. plan**: specs describe what and why; plans describe how and when. Plans are ephemeral. Absorb durable decisions into the spec; delete the plan doc.

## Lifecycle

**Creation (SPEC gate)**: the gate passes when the colocated `SPEC.md` carries `REQ-*` guarantees, each naming its check or marked `unchecked`, non-goals, and acceptance criteria — plus risk tags whenever high-risk items exist. Determine placement, read the existing file and identify gaps (or create at the correct colocated path), and ensure every required element is present before PLAN begins.

**Maintenance**: update spec when behavior changes; append new `REQ-*` IDs, never renumber; replace `unchecked` with the check once it runs, and update a guarantee in the change that renames or removes its check; cross-check spec against implementation whenever both are in context and surface drift.

**Retirement**: when a feature is removed, remove or archive its `SPEC.md`. Do not leave stale specs describing deleted behavior.
