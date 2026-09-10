# Campaign doctrine

Standing answers for unsettled campaign decisions. Shared law lives in
`AGENTS.md`; verification, code, and lifecycle mechanics live in their owning
skills. Apply existing SPEC/BRIEF Decisions first. A deviation from a standing
order is recorded as a dated provisional Decision with evidence; ratified
boundaries change only with human authorization.

## Standing orders

- Campaign control artifacts leave the tracked tree before a shared-branch
  merge. Close LOOP.md through missionctl; route durable content out of an
  optional mission manifest before removing it. Git retains the history.
- An independently required executor is unavailable: continue useful objective
  work to that gate, then hand off the blocker. Do not repeatedly dispatch
  against an established outage.
- Codifying an instruction: use the weakest rule that excludes observed
  failures while preserving a named legitimate neighboring behavior. Put
  incident details and evidence in provenance. An exception list that keeps
  growing is evidence to weaken the rule, not add more exceptions.
- A bug bash contradicts ratified expected behavior: retain the observed
  evidence, then route the product-direction question to the human. Findings
  below the charter's severity floor become follow-up work unless trivial and
  in scope; they never silently extend the campaign.
- A proposed app, service, or component changes the agreed product scope:
  revisit the contract before building it. Internal implementation choices
  already within the outcome remain the driver's responsibility.
- Environment updates broke the toolchain: choose the cheapest reversible
  repair on stable versions and retain an idempotent repair path. Do not jump
  to unstable development versions to escape a current failure.
- Secret provisioning: prepare item structure, references, and wiring so the
  human only supplies the secret material at the boundary.
- A campaign shipped or documentation cleanup was requested: use
  `dissolve-docs` to move durable content into standing documents and remove
  obsolete narrative. Current runbooks and maintained references stay.

## Tie-breakers

Prefer platform-supported design over a custom wrapper. Prefer derivation
from a source of truth over cached local state and cleanup machinery. Produce
verification evidence where the tools run; file ceremony earns no confidence.
A finished deliverable answers the agreed question in one coherent account,
with navigable evidence and explicit limits.
