# Triage

A triager is a read-only lane that surveys a workspace's open issues and pull
requests against its default branch and tells the coordinator which ones it
can act on. Its report is data: the coordinator verifies each claim (law 9)
and acts only under the charter's grants.

## When it runs

After a batch: N lanes finished or landed since the last triage, or a
release published. When no batch triggers, it runs once the time floor has
passed since the last triage. The charter's Budgets and cadence line sets N
and the floor. One triager at a time; it takes a lane slot like any lane.
Log each triage's start and the default-branch commit it read.

## Brief

Launch it through `lane.sh launch` like any lane. Its brief names the forge
repositories, the default branch and the commit to read, the last triage's
time and report, the charter's grant texts quoted verbatim, and the open
items already in flight (lanes, parks, holds) so it does not re-list them.
Its boundaries: read the forge and git only; no comments, closes, labels,
branches, or lanes.

## Report

Four lists, each entry with its item link and evidence a reader can check
without re-running the survey:

- **Closable:** every acceptance item in the body, plus scope the human
  narrowed or widened in comments, is on the default branch. Map each item to
  the commits that cover it. Something covered only in part is not closable;
  name what is covered and what remains, for a progress comment.
- **Fold:** the remaining scope is wholly tracked by another open item. Cite
  that item and the lines that track each remaining piece.
- **Fundable:** a bug that meets each condition of the charter's funding
  grant. Show each condition met (reproduction or cited cause, no product or
  design decision, not high-risk) and an estimate against the grant's budget.
- **Needs owner:** one line each: the decision, the options, and the one the
  evidence favors. Everything that is neither closable, fold, nor fundable
  and cannot move without the human goes here.

Items that need nothing stay off the lists; give their count. Note themes the
open items share, for the next portfolio review.

## Independence

A closure is checked by someone who did not write the fix. Launch the
triager on a launcher that authored none of the commits it cites, or have the
coordinator's verification done by such a reviewer; a closable entry whose
only checker is the fix's author goes to needs owner.

## What the coordinator does with it

1. Verify each entry against git and the forge (law 9). Drop or correct a
   claim that fails, and log the correction.
2. Act on the verified entries the charter's grants cover, each within the
   grant's conditions and budget: close with the citing comment, fold with a
   pointer, launch a fix lane (Launch a lane's checks still apply). A grant
   absent or its condition only partly met: the entry goes to needs owner.
3. Bring needs owner to the human in one batched round (Bring decisions to
   the human), never per item.
