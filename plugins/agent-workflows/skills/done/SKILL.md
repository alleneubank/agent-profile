---
name: done
description: Use when claiming a change done, asking for acceptance or a merge, inviting someone to try a build (a bug bash, dogfood run, or visual or design review), requesting a specialist review, or landing reviewed work.
---

# Done

Done means merged with an evidence record. Acceptance scenarios, written before
the code as things a user or calling agent does and sees, set how much
verification is enough: drive them, plus a high-risk change's own risk
scenarios, and nothing beyond them. The human approves scenarios for features;
the author writes them for fixes. Copy-only changes, and logic whose tests show
what its callers get, need no scenarios beyond those tests. Work verified but
not yet landed (local-only, or awaiting a grant) is reported as verified, not
done.

## Evidence record

Keep it in the pull request body's Evidence section (`git-best-practices`),
or the task record when there is no pull request:

- **Head and build:** the commit and where it ran (localnet, testnet, vendor
  sandbox, simulator).
- **Scenarios:** one row each with surface, what was observed, and a capture
  for UI. A scenario with no observation is not done.
- **Changed behavior:** what a user does differently, per changed control,
  with production's behavior beside it.
- **Verdicts:** each invited role's verdict file and the head it saw.
- **Noticed:** anything you saw that departs from the intent, even where its
  scenario passed. Passing a scenario does not clear what you noticed.
- **Not checked:** what was skipped and why.

## Invite others to check your work

Give each role its charter by path, plus the inputs its charter lists, and
nothing else: not your reasoning, not your diff unless the charter asks for
it. Each returns a verdict file.

| Role | Invite when | Charter |
| --- | --- | --- |
| Guest | whenever a build is worth trying; at the merging head for a new feature or changed flow | [guest](references/guest.md) |
| Design reviewer | a change touches UI | [design reviewer](references/design-reviewer.md) |
| Specialist | a change is high-risk (`AGENTS.md`) | [specialist](references/specialist.md) |

A guest shares your host and uses the build you are already running. Point it
at the build, not at a setup of its own, and say whether that environment is
disposable or live and shared, with its funding budget when it is live. Run the specialist through a
read-only, profile-free launcher, one reviewer per round unless the human asks
for a second. Fix what a verdict finds, then invite a fresh guest or reviewer
at the new head for what the fix could change; the one that saw the last
round tends to confirm its own finding rather than look around it.

## Land

Whoever lands (you under a grant, or a coordinator) checks, in order, and
stops at the first gap:

1. Every scenario has an observation at the head that would merge. Earlier
   evidence counts only while what it covered is unchanged.
2. A new feature or changed flow has a guest verdict with every scenario
   passed, current for that head: a fix after the verdict needs a new guest
   run only for the scenarios it could change. A human-only step (a physical
   device, biometrics) the guest marked blocked passes once the human records
   its result.
3. A UI change has a design verdict at that head with no open blocking
   finding.
4. A high-risk change has a specialist verdict at that head with no open
   blocking finding, or the human's recorded waiver.
5. Required checks are green, not skipped or missing.

A gap sends the work back, naming the missing item. When every item passes,
land under a grant naming this repository and branch. Otherwise ask the human,
linking the evidence record and stating the review status: who reviewed, at
which head, or that no review ran. A yes given knowing no review ran is
recorded as the human's waiver.

## Red flags

- "Done" with a scenario that has no observation, or a behavior change with
  no scenarios
- A verdict from an earlier head presented as current after a change it covers
- A guest given the diff or the author's reasoning
- A merge ask for a high-risk change that does not state its review status
