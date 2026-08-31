---
name: sitrep
description: Use when the user asks for a sitrep, a status report, or "where are we" — on the current campaign or task, on what all agent sessions are doing, or as a written status update for an outside audience
---

# Sitrep

A sitrep is a point-in-time report of claims to the commander. Two laws govern
every shape: **every claim carries its evidence**, and **the reader's decisions
lead**. A sitrep briefs the human now; a handoff (see `handoff`) packages
context for the next agent — do not conflate them.

## Recognize the shape

- **Campaign** — "sitrep" inside a session with active work: report this
  campaign's state. When a `LOOP.md` exists, read state from it (and
  `missionctl context` where available) rather than reconstructing from
  conversation memory.
- **Fleet** — "my sessions", "what's running", "all agents": survey live
  sessions across hosts and roll up.
- **Stakeholder artifact** — a named audience or destination (channel, thread,
  doc): a written artifact other humans will act on. Highest bar; see the
  verification floor.

## Ordering

Lead with what needs the reader — decisions pending, approvals blocking,
boundary items — before any narrative. Then: situation in one or two lines,
progress since last report, in flight, next in order. A reader who stops
after the first section must already know what is theirs to do.

## Content law

- **Delta, not saga.** Anchor to the last sitrep the reader saw; if none, to
  the last boundary event. Report what changed since the anchor; the standing
  situation gets one line, not a retelling.
- **Evidence per claim.** "Done" names its verifier and result (commit,
  gate output, test counts). Work whose gate has not reported is "in flight",
  never "done". Distinguish verified state from inference.
- **In-flight work is identifiable.** Name the worker, task id, or session,
  and the signal that will report its completion.
- **Next in execution order**, not a wish list.
- **Boundary items are explicit** and marked unchanged when they are repeats,
  so the reader can skip what they have already seen.
- State, not activity: "gate green at `<sha>`" beats a narration of the
  commands run.

## Fleet shape

- Survey with whatever session visibility exists (a session index such as
  `recall`, host process listings) and treat the result as a sample, not a
  census: liveness inferred from transcript recency or a process table is an
  approximation that misses quiet-but-live sessions and counts just-finished
  ones.
- State the coverage basis and its gaps in the sitrep itself: which hosts
  were reachable, which were not, what the liveness heuristic was, and as of
  when. An unreachable host is a reported line, never a silent omission.
- One row per session: where (repo/branch), what it is doing, what it is
  waiting on. Filter machinery noise (reviewer sidecars, approval assessors)
  out of the main table.
- Close the lead section with a single "waiting on you" rollup across the
  surveyed sessions — that rollup is the reason the reader asked.

## Stakeholder shape

- Match the destination's markup dialect before writing: chat apps render
  links and emphasis differently from standard markdown — verify link syntax
  for the destination, not for your terminal.
- Scope claims precisely. Overstatement is a defect the verification pass
  must catch: "no deploy happened" and "no *X-enabling* deploy happened" are
  different claims.
- When sent as the user (self-DM, posting on their behalf), say so — the
  destination may not notify them.

## Verification floor

A sitrep published beyond the current session — a channel, a message to
others, a committed doc — is a set of claims, and claims get an oracle:
before sending, have a fresh, disinterested reviewer fact-check each claim
against live state (refs, PRs, running systems), verdict per claim, and fold
corrections in. Wording overstatements count as findings. Interior sitreps
(to the user in-session or their own DM) ship on cited evidence alone.

## Red flags

- A claim with no citation
- "Done" for work whose gate has not reported
- A sitrep that opens with history instead of what needs the reader
- Re-listing settled boundary items without marking them unchanged
- Pasting transcript or raw tool output instead of compressed state
