# BRIEF — <surface name>

> Law doc for <surface>, present-tense, no narrated history — git is the changelog. The Boundary
> and ratified Decisions amend only with human confirmation; the driver appends provisional
> Decisions, marked and dated. Working memory lives in the campaign's LOOP.md State, not here;
> floor waivers are dated Decisions below.

Mission (only if declared): <`.mission/mission.yaml` id and relevant rubric ids>. This BRIEF
governs surface quality and does not duplicate a mission's strategic success rubric.

## Bar

<One sentence: what "shippable" means for this surface. The north-star "done.">

## Dimensions

The few axes "good" decomposes into. When this document doesn't cover a decision, resolve it in
favor of these.

- **<Dimension 1>** — <what it means here>
- **<Dimension 2>** — <…>
- **<Dimension 3>** — <…>

## Floors

The minimum on each dimension, *with how it's measured*. The gate, not the ceiling.

| Dimension | Floor (threshold + measurement) |
|---|---|
| <Dimension 1> | <minimum bar, and the check/tool/metric that proves it> |
| <Dimension 2> | <…> |
| <Dimension 3> | <…> |

## Oracle

The independent verifier — what runs, who executes or judges, and **why it can't
be gamed** (maker ≠ terminal judge). For an operable surface, name the exact
artifact/environment, roles, representative tasks, evidence, severity floor, and
task or time budget of its fresh-participant bug bash.

- **Pre-ship:** <the harness, bug-bash participant, or specialized judge that runs the Floors before ship>
- **Post-ship (live systems only):** <the telemetry/signals that confirm it stays good>

## Never — instant fail

- <Outcome that is always unacceptable, regardless of everything else>
- <…>
- Weakening a floor, or removing a failing item without a dated waiver Decision and a replacement.
- Asking the human to lower the bar.

## Decisions

Calls already made, so the agent never re-asks. **This section grows** — every answered question
becomes a permanent entry. Include the tradeoff/priority policy and standing assumptions. Mark
each entry `ratified` (human-confirmed) or `provisional` (driver call via the ladder — dated,
with rationale, ratified or overturned at the boundary).

- **Priority / tradeoffs:** <e.g. "security > latency; security may force a redesign, latency may not">
- **Assumptions:** <standing assumptions about the environment; revisit if they break>
- <Decision> — <the call, and one line of rationale> (<date>, ratified)
- <Decision> — <…> (<date>, provisional — <consult verdict if one ran>)
- <Floor waiver> — <floor, why it is infeasible, the nearest-feasible alternative in force> (<date>, provisional)

## Boundary — requires the human

The loop never crosses these; they batch to the human handoff.

- Publish: <push / PR / merge / deploy / release>
- Credentials: <live secrets, biometric-gated actions>
- Direction: <genuinely undecided product/architecture calls — accumulate as `blocked: needs N decisions`>
