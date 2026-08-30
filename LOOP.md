---
loop: 1
id: archive-four-skills
objective: Preserve four low-frequency skill bodies behind progressive-disclosure routers while reducing the public catalog to 41 top-level skills.
status: done
phase: BOUNDARY
iteration: 3
iteration_budget: 4
updated_at: 2026-08-30T16:23:13Z
targets:
  spec: [REQ-PI-001]
gates:
  - id: package
    run: npm run check
    green: typecheck and every vitest floor pass, including the 41-skill catalog contract
    state: green
  - id: validate
    run: ./scripts/validate.sh
    green: plugin manifests, skill entrypoints, hooks, and release-tag rules pass
    state: green
  - id: routes
    run: npm test -- --run tests/package.test.ts
    green: all archived references resolve and each routing scenario selects only its intended guide
    state: green
  - id: census
    run: ./scripts/skill-usage.sh
    green: the existing transcript census completes with a nonzero control population
    state: green
units:
  - id: U1
    title: Add the public-catalog structural floor and observe it fail against the prior layout
    targets: [REQ-PI-001]
    state: done
  - id: U2
    title: Archive the four skill bodies behind platform-tooling and spec-best-practices routes
    targets: [REQ-PI-001]
    state: done
  - id: U3
    title: Prove the catalog, links, route selection, validation, and census floors green
    targets: [REQ-PI-001]
    state: done
decisions: []
blockers: []
boundary:
  - publish
  - tag
  - push
---

# Loop: Archive four skills — `main`

## State

- Branch `main`, tree clean before campaign authoring; nothing pushed.
- Review capacity is one deterministic structural and route-selection pass because the archived bodies remain unchanged and the requested route matrix is exact.
- Release version changes, annotated tags, the dotfiles submodule pin, and fleet deploy occur only after this implementation campaign closes.
- U1 red observed with `npm test -- --run tests/package.test.ts`: 44 entrypoints, missing `platform-tooling`, and all four requested routes absent (7 expected failures, 5 existing package tests green).
- U2 moved all four maintained bodies and six supporting guides under references, removed archived frontmatter, and repaired relative links. The targeted route floor passes 12/12.
- U3 green evidence: `npm run check` passed 31 tests; `./scripts/validate.sh` passed both plugin manifests and all 41 skill entrypoints; skill and plugin helper validators passed through `uv --with pyyaml`; the all-time census scanned 803 transcripts with a nonzero control population and reported 41 public skills.
- Structural sweeps found no `SKILL.md` beneath `references/`, no obsolete retired-directory links outside the explicit negative test, and no diff whitespace errors.

## Known pre-existing failures — do not chase (cited evidence only)

- None observed.
