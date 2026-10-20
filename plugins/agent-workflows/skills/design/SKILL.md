---
name: design
description: Use when deciding how something people or agents use should look, read, or behave before it is built — a new or changed screen, flow, command output, error, tool or skill text, or a piece in another medium — or when a change reaches an established product surface that has no design record.
---

# Design

Design answers why something is made this way. Its record is text first: who
uses it (people, agents, or both), what they are trying to do, the states it
must handle, the alternatives considered and why they lost. Wireframes,
mockups, prototypes, video, and models are renderings of that text.

The owner gives direction, feelings, and feedback through prompts; agents do
the rest, crit included. Each convergence point below is one prompt to the
owner through the harness's question tool: the options side by side, the
recommended one first, each with a link to its rendering.

The process exists to kill wrong answers while they are cheap. Raise fidelity
only after the step before it is approved: nothing is built at high fidelity
that a low-fidelity crit could have rejected, and a problem a simpler existing
surface already solves is answered with that surface.

## Pick the rung

| Change | Steps |
| --- | --- |
| Copy only | None; `done` covers it |
| Existing surface changed | Before and after captures of each changed state, then design QA |
| New screen, flow, command, or tool | Flow and state inventory, low fidelity, crit, owner approval, annotated spec, build, design QA, guest usability tasks |
| Redesign or new product | The row above, plus a `BRIEF.md`, tiered tokens, and two or more directions the owner picks from before high fidelity |

A surface with no record gets its as-built record before its first rung
(Established products).

## The record

Keep it in the product repository at `docs/design/<slug>/`: a `README.md`
with intent, users, flow, state inventory, and decision log, plus the editable
sources its renderings come from and the annotated spec. Share renderings
through whatever viewer suits the task. The design issue holds the
conversation; the record holds the result. A builder's brief links the issue,
and a builder who must depart from the spec raises it there first.

## Steps

1. **Flow and state inventory, before screens.** Each step the user or calling
   agent takes, and every state of each surface: empty, loading, partial,
   error, success, offline, denied, plus larger text, dark mode, and the
   narrowest supported width where they apply. For agent surfaces, each
   outcome and error class and the next action it tells the agent to take.
2. **Low fidelity.** Wireframes, breadboards (places, affordances,
   connections), or plain-text output samples. Use the product's design
   system and the platform's guidelines as the defaults.
3. **Directions.** Name the school of thought each direction draws on. When
   the owner's taste is recorded, include one direction from outside it when it
   suits the problem, saying what it would offer; the owner's taste is a lean,
   not a limit.
4. **Crit.** Ask what each direction is trying to do, then whether it does
   it, against the brief's goals, the taste rules, and the platform's
   guidelines. Every finding cites its reference; taste without one is a note.
5. **Owner approval.** The owner picks a direction or sends it back. Run the
   reaction through the taste loop.
6. **Annotated spec.** Tokens, layout, components, every state, interactions,
   accessible labels, and final copy: what design QA checks the build against.
7. **Design QA and usability.** `done`'s design reviewer judges the build
   against the spec and the taste rules. Guests get tasks, not instructions;
   their results are agent evidence, not user research, and the record says
   so. For agent-facing surfaces, `eval` runs are the usability test.

## Taste loop

Capture each owner reaction verbatim with its date. When the reason is not
stated, ask why once. Write it as a rule in the brief's owner's-taste section:
the rule, an example, the alternative it beat, and the evidence. Crit and
design QA apply these rules. Revise a rule when evidence changes, keeping its
origin. Where no rule covers a judgment of feel, bring options; the call is the
owner's.

## Established products

The first change that reaches a surface with no design record starts by
backfilling that surface's as-built record from the running product on its
closest-to-live surface: the flow and state inventory as it behaves today,
baseline captures of each state, the tokens and components actually in use
against the declared system, and taste rules inferred from what is there,
marked inferred. The owner ratifies the record; then the change proceeds on
its rung against it. Inconsistencies the backfill finds become backlog items,
not fixes inside that change. A coordinator may fund backfill for the surfaces
queued work will reach, busiest first.

## On landing

Dissolve the record (`dissolve-docs`): lasting rules move to the brief, the
design system, or the spec. The folder keeps its sources, the final state
inventory, and a short decision log, including why rejected directions lost.

## Red flags

- High fidelity or code before the flow and state inventory exist
- A redesign that offers the owner one direction
- Every direction drawn from the owner's recorded taste with no outside option
- A taste rule without the owner's words
- Guest usability results reported as research with real users
- A builder departing from the spec without raising it on the design issue
- An as-built inconsistency fixed inside the change that found it
