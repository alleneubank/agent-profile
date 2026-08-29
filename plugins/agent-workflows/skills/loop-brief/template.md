---
loop: 1
id: <stable campaign id>
objective: <one bounded outcome this attempt delivers>
status: planned
phase: SPEC
iteration: 0
iteration_budget: <positive numeric cap>
updated_at: <UTC timestamp>
# mission: <mission id>                       # only when the outcome spans campaigns or repositories
# mission: { id: <mission id>, source: { repository: <url>, ref: <ref>, path: .mission/mission.yaml } }
targets:
  spec: [<REQ-ID>]                            # nearest SPEC.md
  brief: [<Floor name>]                       # nearest BRIEF.md
  # mission: [<RUBRIC-ID>]
gates:
  - id: <gate id>
    run: <command>
    green: <what green means>
    state: unknown
units:
  - id: U1
    title: <smallest first unit>
    targets: [<REQ-ID>]
    state: current
decisions: []
blockers: []
boundary:
  - publish
  - merge-tracked-ref
  # - <repository-specific human-only action>
---

# Loop: <campaign title> — `<branch>`

## State

- Branch `<branch>`, tree <clean/dirty>. Nothing pushed.
- <current wall or in-flight fact, with evidence pointers>

## Known pre-existing failures — do not chase (cited evidence only)

- <failure → evidence it predates this campaign>
