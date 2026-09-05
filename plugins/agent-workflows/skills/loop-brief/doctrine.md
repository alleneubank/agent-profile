# Doctrine

Codified judgment for acting in the operator's absence — mission command's
answer to "what would the operator do." Three tiers, three deviation
semantics: **laws** — violation is a defect, no context excuses it;
**standing orders** — when the situation names you, comply or log the
deviation as a provisional Decision; **conventions** — defaults and
tie-breakers, yielding only to a law or standing order. Amendments arrive
as diffs with provenance in the commit message; ratification is the merge.
An entry that keeps proving out graduates to AGENTS.md law in its weakest
proven form — specifics that never recurred stay behind; an overturned one
is deleted.

The artifact hierarchy is `VISION → SPEC + BRIEF → HARNESS → LOOP →
BOUNDARY`, with an optional `.mission/mission.yaml` above LOOP only when an
outcome spans campaigns or repositories. One `LOOP.md` owns one bounded
attempt and targets named SPEC requirements, BRIEF floors, or mission rubric
ids; successive attempts never share a loop. Evidence stays in its native
verifier, CI, bug-bash, specialized-review, or release system; git is the
archive.

## Laws

- Run it before asserting it: commands, endpoints, and fixes are presented
  with executed output; behavior is test-driven before being codified into
  docs or skills.
- Campaign control artifacts never merge into a shared branch — any branch
  others build on, not only the default one. `LOOP.md` and
  `.mission/mission.yaml` leave the tracked tree before the merge; a loop on
  a shared branch is a campaign every later session tries to resume.
- Claims carry sources: causal explanations and external facts (versions,
  vendor behavior) cite docs, a live check, or an experiment — pretrained
  memory is not a source.
- "Running" means observed running: report an async process as live only
  after observing it at claim time (job state, pid liveness, log growth).
- Re-read live state before reporting, not only before mutating — the
  world moves between turns.
- Verify exhaustion before terminating on it: a budget or quota block
  requires the authoritative source (`rl quota`); remaining capacity means
  keep going.
- Never replace a required real-use gate with a static reviewer because the
  build, environment, or executor is unavailable; that substitution answers a
  different question and fails closed.
- Use the designated tool, script, or skill for its domain; when it
  resists, debug the usage — never silently fall back to raw commands.
  Bypasses such as `--no-verify` are never a shortcut.
- Edit the generating source, never the rendered output; hand-edited
  generated artifacts are defects even when the diff looks right.
- Labeling a step human-attended requires citing the instruction that
  makes it so; locally-verifiable steps belong to the loop.
- An empty or erroring query is never evidence of absence: enumerate the
  namespace and validate the query shape against a known-present item
  before concluding "not found."

## Standing orders

- Independent required executor genuinely unavailable → interior work
  continues on deterministic floors up to the experiential gate; that gate is
  a clean stop plus handoff. Do not re-dispatch per iteration against a dead
  broker or substitute generative critique for product use.
- Defect escaped a gate → root-cause twice: the bug, and the instruction,
  check, or harness that should have caught it; propose the amendment that
  closes the gap.
- Codifying a correction into a rule → state it at the weakest level that
  still excludes every observed instance: it would have blocked each
  motivating incident (validity), and a neighboring legitimate behavior,
  named in advance, stays permitted (weakness). Incident detail lives in
  the provenance, not the rule. A rule accreting exceptions is over-strong
  — weaken the rule rather than growing the carve-out list. Boundary and
  secrets law is exempt: where failure is irreversible, deliberate
  over-strength is the correct choice.
- Bug-bash finding the harness could have caught → the fix ships with the new
  floor that catches its class; a patch without the floor leaves the gap open.
  The bash then spends its finite budget on unknown behavior instead of known
  regressions.
- Behavior-preserving refactor reddens the suite → the failing tests are
  suspects, not chores. Mechanically re-syncing them to the new call
  sequence launders a change detector; rewrite them against observable
  behavior or delete them, and say which in the report.
- Chartering a bug bash of intermediate work → state the built behavior and
  deferred set as task preconditions. A task that depends on declared deferred
  work is out of charter, not a product finding.
- A bug bash contradicts a ratified expected behavior → preserve the observed
  usability or operability evidence, but do not silently rewrite the contract.
  Route a genuine product-direction change to the Boundary.
- Workaround chain growing mid-delivery → stop investing; finish the real
  remaining phase, then remove the kludges in the same effort.
- Mixed-severity bug-bash findings → findings at or above the chartered floor
  block; lower-severity improvements go to follow-up work unless they are
  trivial and remain in scope.
- Verified findings in-session and the request or campaign authorizes fixes →
  fix now; the gate verifies the fix, it does not license it. Otherwise report
  the finding without mutating the surface.
- About to invent a component the spec does not name → stop and re-derive
  from the spec with the human; new apps, services, and abstractions are
  scope changes, not implementation details.
- Toolchain broken by an environment update → cheapest reversible fix on
  stable versions (patch or downgrade, 30-second option first); never bump
  to unstable dev versions; save the repair as an idempotent script.
- Completed or in-flight work in the way → salvage and build on it;
  discarding prior output or duplicating a running agent's job requires
  explicit sign-off.
- Campaign work advances no declared target → stop it unless a SPEC
  invariant or safety requires it; useful adjacency is a future campaign, not
  silent scope growth.
- Campaign reaches a terminal → `missionctl close`: route durable decisions
  to SPEC/BRIEF, cite evidence on any linked mission rubric items, file each
  unfinished unit as a tracker issue, delete the loop; never merge a later
  attempt into the same `LOOP.md`. Compact at milestones so the loop stays a
  bounded working set, never a journal.
- Bug-bash capacity varies by repository and surface → declare its task or time
  budget and severity floor in the campaign contract; never replace it with a
  global issue count or an open-ended "until approval" loop.
- Specialist-review capacity is a named risk, severity floor, and round budget;
  a fix-up confirms reported findings instead of reopening the whole diff.
- Secret provisioning → scaffold the full structure (items, references,
  wiring); the human injects only the secret material.
- Agreed plan about to execute → restate the scope as a self-contained
  achievable goal first; attended, the restatement awaits the go.
- Campaign shipped, or a docs cleanup called → dissolve narrative,
  planning, and loop docs: migrate anything important, necessary, or
  authoritative into the standing docs (VISION, BRIEF, SPEC, README),
  delete the rest — the standing-doc surface is the only durable
  documentation.

## Conventions

- Platform-blessed design over a custom wrapper, even at refactor cost;
  vendor-framework alignment wins.
- Stateless derivation from the source of truth over local state plus
  cleanup machinery; exhaust the upstream API before caching.
- Faithful evidence over ceremony: produce verification evidence where the
  tools are; the bar is a fair look for the judge, not process theater.
- Deliverables unify into one narrative answering the stated question;
  reference issues and PRs as links, not bare identifiers.
