---
name: code-law
description: Use when writing or changing code in any language — the craft law (types, assertions, bounds, errors, naming, comments, scope) and the system properties (deterministic, hermetic, idempotent, isolated, observable, evented, contextual) with the floor that proves each one. Not for prose, docs-only, or config-only changes.
---

# Code Law

The craft law for code. `AGENTS.md` keeps the law whose violation is
unrecoverable — boundary, secrets, publish, self-approval, done-claims.
This skill carries the law whose violation the harness and the review gate
catch.

**A property you want held gets a detector, not a paragraph.** A sentence
saying "be deterministic" changes nothing; the floor that reddens on a
violation is what holds. Build the detector when you name the property.

## Craft

- Types first: define types and data models before logic; make illegal
  states unrepresentable; schema changes drive implementation.
- Assert the invariants code relies on. Programmer errors (violated
  invariants) are asserted and crash; operating errors (bad input,
  timeouts) are handled and reported — never confuse the two. Assert
  positive and negative space; pair assertions across independent points;
  prefer the cheaper rung (compile-time > runtime > test). Put a limit on
  everything: every loop, queue, buffer, cache, retry, and recursion
  carries an explicit bound; intentionally infinite loops assert it.
- Optimize for the reader's cognitive load. Keep each function at one level of
  abstraction; order statements with their data flow; keep relevant details
  close and hide only details whose abstraction reduces what the reader must
  hold. Abstraction and indirection are costs too, so add them only when the
  resulting contract is clearer.
- Prefer immutability and pure functions; isolate side effects at system
  boundaries; push `if`s up and `for`s down — parents own control flow and
  state, leaves stay pure. Use guard clauses for exceptional paths and short
  cases; use `else` when complementary branches are both core logic. Break up
  nested control flow and mixed boolean expressions into named decisions.
- Errors are handled or propagated, never swallowed. Keep the failure region
  narrow: wrap only the operation whose failure is handled, catch only the error
  meant to be handled, and preserve the original cause when adding context.
  Validate at system boundaries and only there — a check protecting a state an
  upstream boundary already guarantees is deleted, not kept for safety. Publish
  externally visible state only after every fallible operation succeeds, so a
  failure leaves the prior state intact. External calls carry explicit timeouts
  and bounded retries with backoff; handle edge cases explicitly.
- Refactor with clean breaks: update all callers, complete the migration,
  delete superseded code — supersession is the default; confirm
  replace-vs-add in one line only when genuinely ambiguous. Review findings
  never restructure a PR or rollout without confirmation. An unshipped feature
  has no compatibility surface: its experimental behavior is not a contract, so
  it earns no shim, no dual path, and no deprecation window. Tests that redden
  under a supposedly behavior-preserving refactor are first suspected of having
  caught a regression it introduced; only the ones asserting the old call
  sequence rather than an outcome are change detectors, and those are part of
  the migration — rewrite them against behavior or delete them.
- Name clearly and precisely at the code's abstraction level. Omit type words,
  surrounding context, and filler the reader already has; prefer a longer name
  to an ambiguous one. Established abbreviations such as `RPC` are useful when a
  future reader in the domain will understand them; expand obscure or local
  abbreviations. Name booleans positively, use long-form flags, and put units and
  qualifiers last by descending significance (`latency_ms_max`).
- Comments earn their place by explaining intent, rationale, non-obvious
  constraints, or an apparent rule violation. Preserve comments that protect an
  ordering or safety constraint. Replace narration of what code does with clearer
  names or structure, and replace enforceable assumptions with assertions.
  Public API comments state the contract, not implementation details.
- Declare variables at the smallest scope, computed closest to use. Extract
  configuration immediately: magic values live in config, not code.

## Interfaces and abstraction

- Make the correct call easy and misuse hard. Prefer compiler-enforced contracts,
  then runtime checks, then documentation. Return fully initialized values, use
  domain types for constrained values and units, and group parameters that form
  one concept into a value object. Put lifetime collaborators in construction and
  pass per-call work to the operation.
- Choose defaults by the cost of a mistake. Destructive or irreversible behavior
  is explicit opt-in; environment-specific targets that cannot be chosen safely
  are required rather than guessed. A convenient default is valid only when its
  accidental use is acceptably safe.
- Deduplicate when evidence shows one shared concept that should evolve together,
  not merely identical syntax today. Keep coincidentally equal domain rules
  separate; when evidence is insufficient, tolerate duplication until the common
  abstraction becomes clear. Build for current and planned use cases, not merely
  possible ones. A test seam is justified by its real consumer, but speculative
  generality is not.
- Wrap an external API when doing so clearly bounds change or gives the domain a
  better contract; do not wrap familiar standard types by reflex.

## Properties

Determinism, hermeticity, idempotency, isolation, and observability are law:
an instance that cannot hold one carries a waiver. Evented and contextual are
defaults: they yield to a named alternative, and no waiver is owed.

### Deterministic — same inputs, same outputs, same interleaving

Sources of drift: wall clock, unseeded randomness, UUIDs, map and set
iteration order, `readdir` order, thread scheduling, locale, timezone, hash
seeds. The fix is always the same shape: inject the clock, the seed, the id
generator, the scheduler. Never reach for them ambiently.

**Floor:** two checks, and conflating them is the common mistake.
*Repeatability* — run twice with the **same** seed and diff; any difference
is nondeterminism. *Order-independence* — vary only what must not matter
(runner shuffle seed, thread scheduling, map iteration order) and assert the
result is unchanged. A seeded algorithm legitimately produces different
output under a different **algorithm** seed; that seed is an input, so
changing it proves nothing. For engines with a fixed input set, a seeded
simulator whose emitted trajectory is compared against a golden run.

### Hermetic — depends only on declared inputs

Failures: tests that reach the network, tools resolved off `PATH`, absolute
paths, implicit environment variables, host state. Determinism says the same
inputs give the same output; hermeticity says the inputs are all declared.
Reproducible = hermetic + deterministic.

**Floor:** run with the network off, a scrubbed environment, and a foreign
`$HOME`.

### Idempotent — applying twice equals applying once

Three shapes people conflate: the idempotent operation (`f(f(x)) == f(x)`),
the convergent reconciliation (desired state, applied to a fixpoint), and
exactly-once effects via an idempotency key. Its sibling is **atomic**:
idempotency covers the re-run, atomicity covers the interrupted run —
write-temp-then-rename, all-or-nothing apply. Neither alone is crash-safe.

**Floor:** run it twice; assert the second run is a no-op and the diff is
empty. Then kill it mid-apply and run it again.

### Isolated — no interference between concurrent instances

Own tmpdir, own port, own database, own fixtures. Distinct from hermetic:
hermetic is no external dependence, isolated is no inter-instance
interference. A flake that root-causes to shared state between tests is an
isolation defect, not a flake.

**Floor:** run the suite in parallel and in random order.

### Observable — the failure is diagnosable from artifacts alone

Emit structured fields rather than prose-only log lines, with enough context to
identify the failing operation and state.

**Floor:** cause the failure, then diagnose it using only the emitted logs,
metrics, and traces — without re-running and without adding instrumentation.

### Evented — react to state change, don't poll or nap

Wait on a condition, not a duration. A bare `sleep` used as synchronization
is the defect. Two pairings matter more than the property itself:

- **Level-triggered, edge-woken.** Pure edge-triggered systems drop events
  and never recover. The event says *when* to reconcile; the desired-state
  comparison decides *what* to do.
- **Delivery is at-least-once, so consumers must be idempotent.** Evented
  without idempotent is a duplicate-effect bug waiting for its first retry.

**Floor:** ban bare sleeps structurally; assert the teardown or convergence
latency, not the sleep duration.

### Contextual — the call carries what dictates its possibilities

A side-effecting function receives the context of the event that authorizes
it. One structure does four jobs: capability (what this call may do), scope
(deadline and cancellation), provenance (which event, on whose behalf), and
the fields its logs and spans carry. "Dictates the possibilities" is the
load-bearing part — the argument shape should make illegal *effects*
unrepresentable, which is types-first applied to effects and authority
rather than to data.

**Floor:** one assertion per job the context does, and the first is the one
usually missing. *Capability* — construct a context that withholds an
authority and assert the call fails rather than reaching for an ambient
fallback; without this, code that kept its ambient authority passes every
other check. *Scope* — assert cancellation propagates to the leaf.
*Provenance* — assert every record on the path carries the correlation id.

## Waivers

An instance that cannot hold a property carries a waiver comment naming the
property, why this instance can't hold it, and whether it is debt or a
permanent exemption. Debt names what would remove it.

```
// <property>: <why this instance cannot hold it>. <Debt — removed by X | Permanent — X makes it impossible.>
```

A waiver is written prose a reviewer can judge, never a suppression flag. A
waiver list that grows without its debt entries shrinking means the property
was stated too strongly — weaken the property, don't grow the list.
