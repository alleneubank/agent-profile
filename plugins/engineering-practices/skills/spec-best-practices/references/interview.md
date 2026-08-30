# SPEC Interview Mode

Use this workflow to turn an incomplete `SPEC.md` into an implementation-ready
contract.

## Workflow

1. Identify the target `SPEC.md`; if none is provided, search likely colocated paths.
2. Read the spec and list missing required elements:
   - problem and solution narrative
   - domain model
   - `REQ-*` requirements
   - invariants
   - non-goals
   - acceptance criteria
   - risk tags for high-risk work
3. Ask focused questions that materially change the spec.
4. Fold answered decisions into the spec.
5. Stop when the spec can drive implementation without guessed requirements.

## Question Quality

Prefer questions about data models, invariants, edge cases, security,
operability, compatibility, and scope boundaries. Avoid questions that can be
answered by reading the repo, or already answered in the surface's Decisions
or the doctrine.
