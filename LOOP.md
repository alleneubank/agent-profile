---
loop: 1
id: doctrine-loop-first
objective: Make every agent-profile skill and law describe the standalone LOOP.md contract, the optional mission, and the missionctl command set, so no skill promotes evidence into a required MISSION.md or keeps append-only loop narrative.
status: active
phase: DEV
iteration: 1
iteration_budget: 6
updated_at: 2026-08-29T15:30:00Z
mission:
  id: mission-control-arc
  source:
    repository: https://github.com/alleneubank/missionctl.git
    ref: feat/typed-mission-control
    path: .mission/mission.yaml
targets:
  mission: [CONSUMERS-001]
gates:
  - id: check
    run: npm run check
    green: typecheck and every vitest floor pass
    state: green
  - id: validate
    run: ./scripts/validate.sh
    green: manifest, skill, and hook gates pass
    state: green
  - id: loop
    run: missionctl check --root .
    green: this loop validates
    state: green
  - id: stale-references
    run: grep -rn "mission_control\|missionctl \(current\|portfolio\|drill\|prompt\)\|PreCompact\|PostCompact" AGENTS.md SPEC.md README.md plugins tests
    green: no matches
    state: green
units:
  - id: U1
    title: mission-command SKILL.md and references/schema.md describe loop:1, the optional mission, and the surviving commands
    state: done
  - id: U2
    title: loop-brief SKILL.md, template.md, and doctrine.md make LOOP.md standalone, drop mission_control fields, and end campaigns through close dispositions
    state: done
  - id: U3
    title: dissolve-docs, handoff, writing-plans, afk, eval, and brief-best-practices stop routing evidence into MISSION.md
    state: done
  - id: U4
    title: AGENTS.md stack, SPEC.md hook sentence, README command list, and the package test comment match the one-hook plugin
    state: done
  - id: U5
    title: "Skill and validation gates green; draft PR #2 body refreshed"
    state: current
decisions:
  - date: 2026-08-29
    call: SPEC.md D7 is amended in place to the single SessionStart hook instead of adding a superseding decision, because the compaction hooks never shipped.
    status: provisional
  - date: 2026-08-29
    call: The stack diagram lists MISSION last as optional rather than removing it, so cross-campaign outcomes keep a named home.
    status: provisional
blockers: []
boundary:
  - publish
  - merge-tracked-ref
---

# Loop: doctrine LOOP-first — `feat/typed-mission-control`

## State

- Iteration 1: U1–U4 rewritten; `npm test` 23/23, `./scripts/validate.sh` ok, `stale-references` grep empty, loop validates via the missionctl dist binary.
- The mise shim `missionctl` resolves to nothing in this directory (no global version; fleet pin is rc.1 which predates `loop: 1`). Gates ran with `/Users/allen/0xbigboss/missionctl/dist/missionctl --root .`; the pin moves with the dotfiles campaign after the release exists.
- The `mission.unavailable` warning is expected until missionctl resolves `mission.source` to a sibling checkout (proposed missionctl follow-up).
