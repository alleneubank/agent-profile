---
name: brief-best-practices
description: Use when creating, reviewing, or updating a BRIEF.md (the quality law for a surface), defining what "good"/shippable means, or setting up a verified autonomous loop.
---

## What a brief is

A `BRIEF.md` is the **verifier's spec** — the codified taste that says what "good" means for a surface, so an agent can verify its own iterations and run a loop without guessing or interrupting. Where `SPEC.md` is the contract (*what* to build: `REQ-*`, invariants), the brief is the bar (*what "good" is*, and *who judges*).

It is the **BRIEF** rung in the stack `VISION → SPEC → BRIEF → HARNESS → LOOP → BOUNDARY`: the brief is what makes the autonomous loop trustworthy, because the harness runs the brief's floors and the oracle judges against them.

## When to author one

Author or update a brief when work will **loop** (you'll iterate against it more than once) or when the **cost of being wrong is high**. Trivial, one-shot changes need no brief — do not manufacture ceremony; *propose* an expensive brief+harness before investing in it.

Subjective surfaces (a docs page, a report, a visual artifact) get a **mini-brief** before the first draft: one reference to mirror plus a 3-line never-list. Capture any post-hoc taste correction into that surface's Decisions the same session — an uncodified correction recurs.

## Naming & placement

Always `BRIEF.md`, colocated with the surface it governs: root for project scope, `apps/foo/BRIEF.md`, `packages/bar/BRIEF.md`, or a docs subtree (e.g. `docs/toys/BRIEF.md`). Working memory never lives beside the brief as sidecar docs — the `DELTA.md` / `DEVIATIONS.md` pattern is retired: per-round gaps and iteration facts belong to the campaign's LOOP.md State (loop-brief skill), and an infeasible floor's waiver is law, not working memory — it lives in the brief's own Decisions, dated, naming the floor, the blocker, and the nearest-feasible alternative in force. A surviving sidecar dissolves (dissolve-docs skill). The brief is present-tense law; git is the changelog.

## The seven slots (required concerns, adaptable shape)

The contract is that all seven *concerns* are present, in this order — not a fixed `##`-count. The *content* adapts to the domain (a payments flow, an indexer, a CLI, a 3D toy); the *concerns* never change. A domain may split a concern across sections, or close with a culminating **"Final acceptance"** coda: one whole-surface test that restates the Boundary as a gate ("then the human ships it; the real gate is a user who…"). That coda is a framing of Boundary + Oracle, not an illegal eighth slot. The rule is *don't drop a concern* — not *don't add a heading*; still, keep sections as few as the content allows. **Absent a house dialect (see Authoring rules), these seven are the skeleton.**

1. **Bar** — one sentence: what "shippable" means for this surface. The north-star "done."
2. **Dimensions** — the few axes "good" decomposes into (correctness, idempotency, auditability, security, latency, recognizability…). Keep it short; these are the quality factors, not a feature list.
3. **Floors** — the minimum on each dimension *with how it's measured* (a floor without a measurement method is useless: "p95 < 200ms, measured via X"). The gate, **not the ceiling** — passing the floor licenses ship, not perfection.
4. **Oracle** — the independent verifier: what runs, who judges, and **why it can't be gamed** (maker ≠ judge). Pick the pattern that fits the surface: property tests or a staging run against forked state (objective surfaces); a **deterministic simulator over fixed golden/archetypal inputs** whose emitted trajectory a domain expert reads (pure engines — the inputs are fixed, so tuning to flatter one case visibly shifts the others); a **blind human-judge quorum** — fresh-context judges, ideally across vendors, naming the artifact with no context (subjective/taste surfaces, where no automated check can decide). For live systems the oracle extends past ship into **telemetry** — the prod signals that confirm it stays good.
5. **Never** — outcomes that are always a fail regardless of everything else (the safety invariants / "never events"). Concrete and absolute.
6. **Decisions** — calls already made, the **tradeoff/priority policy** ("security > latency; security can force a redesign, latency cannot"), and assumptions, so the agent never re-asks. This section **grows**, in two tiers: **ratified** (human-confirmed) and **provisional** (a reversible interior call the driver made via the unblocking ladder — dated, with rationale, ratified or overturned at the boundary). This is where mid-loop questions go to die.
7. **Boundary** — what requires the human: publish, biometric, live secrets, and genuine unknowns. Naming it tells the agent exactly what it may and may not do unattended.

**Show, don't just tell.** Any slot that is ambiguous earns a concrete instance — a golden example and/or an anti-example. Agents ground on exemplars; the Never list and the Oracle especially benefit.

## Governance preamble

Open every brief with a one-line law statement, e.g.:

> Law doc for `<surface>`, present-tense, no narrated history — git is the changelog. The Boundary and ratified Decisions amend only with human confirmation; the driver appends provisional Decisions, marked and dated. Working memory lives in the campaign's LOOP.md State, not here; floor waivers are dated Decisions below.

## Authoring rules

- **Match the house first.** If the repo already has ratified briefs, copy *their* shape — section names, voice, any closing coda — over this skeleton. Consistency across the brief set beats the generic template; the seven concerns are the fallback when no house dialect exists yet. A reviewer judges a brief against the house dialect, and must not reject it for matching the repo's own law.
- **Evidence-based.** Ground Dimensions and Floors in the real surface; cite reference exemplars. Do not invent thresholds, signals, or behaviors.
- **The oracle must be independent.** Maker ≠ judge for any subjective dimension. Name *why* it can't be gamed — without independence the gate is theater.
- **Floors are gates, not ceilings.** A passing artifact may still owe refinement; say so. Never weaken a floor to pass a gate — an infeasible item gets the nearest-feasible alternative plus a dated waiver Decision naming the blocker, and the gap stays on record.
- **Calibrate claims to enforcement.** Match absolutist words ("never", "cannot") to what the oracle actually proves. Overclaiming invites reject cycles.
- **Parsimony.** Few, well-crafted floors that cover the cases beat a long brittle list. The brief is read every loop; every line earns its place.
- **Mutation policy.** The Boundary amends only with explicit human confirmation, and ratified Decisions are never re-litigated. The driver appends provisional Decisions freely — that is the ladder working — marked as such and never silently promoted to ratified. When brief/implementation drift is found, surface it — the human decides.

## Lifecycle

- **Creation.** When work begins to loop or the cost of being wrong is high. Draft the seven slots; the human ratifies. The harness is built to run the Floors; the Oracle is wired before iteration starts (harness-first).
- **Maintenance.** Decisions grow from two feeds: answered boundary batches, and provisional entries ratified (or overturned) at the boundary — an interactive question is the exception, not the source. Corrections whose reach outlives the surface route to the doctrine instead. Floors tighten as the bar rises (rewrite as if always true). Cross-check the brief against the implementation whenever both are in context; surface drift.
- **Retirement.** When a surface is removed, remove or archive its `BRIEF.md`. Do not leave a stale law describing deleted behavior.

## How the brief drives the loop

The brief is inert until it runs: the **harness** runs the Floors and emits pass/fail with evidence; the **oracle** judges the subjective Dimensions independently; the **OODA loop** iterates against them to `done` or a bounded, honest `blocked`. In a campaign, the LOOP.md charter names this brief and carries the loop's live State and Decisions.

## References

- `template.md` — the blank seven-concern skeleton, copy-paste ready *when no house dialect exists yet*; if the repo already has briefs, mirror those instead.
- `example-payments.md` — a filled brief for a money-transfer flow: the **objective** archetype, where floors are machine-checkable and the oracle is property tests + staging. The **subjective/taste** archetype — a visual or design surface whose bar is "elegant, calm, recognizable" and whose oracle is a blind human-judge quorum (maker ≠ judge) closing on a culminating "Final acceptance" frame — is the harder, more common product case; build its oracle from the blind-judge pattern in the Oracle slot.
