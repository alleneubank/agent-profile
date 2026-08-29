# BRIEF — engineering-practices doctrine

> Law doc for engineering-practices doctrine, present-tense, no narrated history
> — git is the changelog. The Boundary and ratified Decisions amend only with
> human confirmation; the driver appends provisional Decisions, marked and
> dated. Working memory lives in the campaign's `LOOP.md` State, not here; floor
> waivers are dated Decisions below.

## Bar

The skills reliably change an agent's engineering judgment without becoming a
wiki mirror, a list of absolutes, or a harness-specific procedure.

## Dimensions

- **Contract fidelity** — guidance resolves realistic choices in favor of the
  intended engineering outcome while preserving legitimate exceptions.
- **Parsimony** — every rule changes a decision; duplicated explanation and
  generic capability advice are absent.
- **Portability** — a skill works from its installed files in every supported
  harness without private paths or unavailable tools.
- **Coherence** — the two skills agree with `AGENTS.md`, language-specific skills,
  and each other.

## Floors

- Contract fidelity: A fresh-context reviewer applies
  `tests/engineering-practices-scenarios.md` and reports no material-or-higher
  finding on its declared severity scale.
- Parsimony: Independent review finds no rule that merely restates another rule
  or teaches generic model capability without changing a named decision.
- Portability: `./scripts/validate.sh` passes and review finds no runtime
  dependency on `eng-wiki`, a private path, or a harness-only primitive.
- Coherence: `npm run check` passes and review finds no contradiction between
  the revised skills or with always-loaded law.

## Oracle

- **Behavioral:** A fresh-context, disinterested reviewer sees only the revised
  skills, fixed scenarios, contract, and declared deferrals. The author neither
  supplies expected answers inline nor grades the result.
- **Mechanical:** `npm run check` and `./scripts/validate.sh` run from the
  repository root after the final mutation.

## Never — instant fail

- A blanket rule that makes one test shape, double, or E2E scope correct in every
  context.
- A prose rule whose named legitimate neighboring behavior becomes forbidden.
- Runtime dependence on the external wiki or a private checkout path.
- A release mutation or publish action inside this campaign.
- Weakening a floor or removing a failing scenario without a dated waiver
  Decision and replacement.

## Decisions

- **Priority:** contract fidelity > parsimony > stylistic completeness; a compact
  rule may omit wiki detail but may not reverse its settled judgment.
- The fixed scenarios are the behavioral reference; exact skill wording is not a
  test contract. (2026-08-29, ratified)
- `AGENTS.md` stays unchanged unless evidence shows a doctrine failure is
  unrecoverable when a skill does not load. (2026-08-29, ratified)
- Two fresh-context review rounds are the campaign's review-capacity limit.
  (2026-08-29, ratified)

## Boundary — requires the human

- Publish: version bump, release commit, tag, push, PR, merge, or marketplace
  publication.
- Credentials: any live secret or biometric-gated action.
- Direction: any proposed expansion into language-specific or workflow skills.
