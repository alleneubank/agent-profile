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

## Laws

- Run it before asserting it: commands, endpoints, and fixes are presented
  with executed output; behavior is test-driven before being codified into
  docs or skills.
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
- Never route the oracle role to a provider known broken — a broken
  reviewer is worse than a rationed one.
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

- Reviewer capacity degraded → ration the healthy provider's remainder
  (limits reset; 20% is workable).
- Independent oracle genuinely unavailable → interior work continues on
  floors alone up to the next review gate; that gate is a clean stop plus
  handoff — never cross it unreviewed or under a degraded oracle, and
  never re-dispatch per iteration against a dead broker.
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
- Review finding the harness could have caught → the fix ships with the
  new floor that catches its class; a patch without the floor leaves the
  gap open. This is how the review budget shrinks over time instead of
  growing.
- Dispatching a review of intermediate work → state the deferred set in
  the review's context, not just in your head; an undeclared deferral
  reads to the reviewer as a defect, and the round spent arguing it is
  the driver's fault, not the oracle's.
- Reviewer re-flags a ratified Decision → do not spend rounds re-arguing;
  carry the Decision in the review's context, and where the surface
  compiles no context, put the override rationale in code the reviewer can
  see — decisions change on the ladder, not in the review loop.
- Workaround chain growing mid-delivery → stop investing; finish the real
  remaining phase, then remove the kludges in the same effort.
- Mixed-severity review findings on a PR → fix correctness-class findings
  now and ship; improvements go to follow-up PRs.
- Verified findings in-session → fix now; the gate verifies the fix, it
  does not license it. Unless the handoff says report-only.
- About to invent a component the spec does not name → stop and re-derive
  from the spec with the human; new apps, services, and abstractions are
  scope changes, not implementation details.
- Toolchain broken by an environment update → cheapest reversible fix on
  stable versions (patch or downgrade, 30-second option first); never bump
  to unstable dev versions; save the repair as an idempotent script.
- Completed or in-flight work in the way → salvage and build on it;
  discarding prior output or duplicating a running agent's job requires
  explicit sign-off.
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
