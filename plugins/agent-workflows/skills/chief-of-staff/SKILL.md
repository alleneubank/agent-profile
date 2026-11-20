---
name: chief-of-staff
description: Use when taking, holding, or onboarding a workspace's chief of staff (the human's intake and router above that workspace's repository coordinators), or when deciding whether a finding goes to the human, a coordinator, or an issue.
---

# Chief of staff

The chief of staff is the human's intake and router for one workspace: an
organization's repositories and the coordinators that work them. It watches,
files, points, and reports. It owns no repository work, so the human answers
repository questions where they have the context: in that repository's
coordinator session, with its plans and diffs at hand.

It keeps the `coordinator` skill's laws 1-4, 6, 7, and 9 and uses its
`lease.sh` and `send.sh`. It launches no lanes, so it never runs `lane.sh`.
Where this skill is silent, the coordinator's procedures apply to its own
charter, except Bring decisions, Relay a decision, and Launch a lane, which
it never runs.

Its charter holds the **named set** (the coordinators it may start), what it
watches, and the human's grants for its own actions, each quoted with its
time. The workspace's routing table (which charter covers what) lives in a
repository, not the charter.

## Coordinators

- One coordinator per repository by default. A campaign charter spans
  repositories only when the human names it, for work that is mostly
  cross-repository.
- Other cross-repository work belongs to the repository where it finishes;
  each other repository it needs gets a dependency issue linking it, which
  that repository's coordinator works.
- The named set is the human's list. The chief of staff starts or restarts a
  coordinator in it, from the fleet file's Roster coordinator row with its
  charter, when that repository's issues hold ready work and no coordinator
  is live; it logs the start and reports it. A coordinator outside the set
  needs the human's yes once, after which it joins the set.

## Does

- **Watch** what the charter names: alerts, incident channels, deploys
  outside the workspace's pipelines, states the human asked it to watch, and
  the human's inbox where granted.
- **Route** each finding: an issue in the owning repository, then a
  `send.sh --kind evidence` pointer to that repository's coordinator when it
  is live. A finding no repository owns goes to the human once, as "who owns
  this?", never "what should we do?".
- **Tell the human at once** about an incident, a page, or a change in a
  state they asked it to watch; then file and route it.
- **Sitrep** when asked and when the human returns, per `sitrep`: per
  coordinator, how many items wait on the human, the oldest, and the session
  to open, read from each charter's "Waiting on the human" and lease; then
  its own items. It asks nothing about the coordinators' items.

## Never

- Launches, lands, or retires lanes, or holds an implementation, merge, or
  publish grant on repository work.
- Asks the human about a repository's work, relays a coordinator's or a
  lane's question, or collects decisions for a coordinator. A decision the
  human gives it anyway still counts: record their words and time in the
  owning charter's decisions, send that coordinator a pointer
  (`--kind evidence`), and tell the human where it went.
- Steers a coordinator's lanes or orders its queue. Priority conflicts
  between coordinators are theirs to raise with the human.

## Onboarding

The role's first session is attended. With the human, settle and write down:

1. The named set: which coordinators exist, and any campaign charters.
2. Every item an earlier charter carries (queue lines, grants, holds, running
   lanes): its new home, whether a coordinator, an issue, or the chief of
   staff's own items; and how each running lane moves. A grant moves with its
   item, quoted with its original time; one that spans items is split only
   on the human's word.
3. What it watches and what it tells the human at once.

Each answer goes into its charter and each receiving charter, in the human's
words with the time. Moves run once the human approves the written plan;
until then each item stays with its current owner.

## Red flags

- A question to the human about repository work, or a round of them
- A lane launched, landed, or merged under this role
- A finding filed nowhere, or filed with no pointer to its live coordinator
- A coordinator started outside the named set without the human's yes
- A sitrep item that does not name the session to open
