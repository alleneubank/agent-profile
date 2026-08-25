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
- Prefer immutability and pure functions; isolate side effects at system
  boundaries; push `if`s up and `for`s down — parents own control flow and
  state, leaves stay pure.
- Errors are handled or propagated, never swallowed; fail loudly; validate
  at system boundaries and only there — a check protecting a state an upstream
  boundary already guarantees is deleted, not kept for safety. External calls
  carry explicit timeouts and bounded retries with backoff; handle edge cases
  explicitly.
- Refactor with clean breaks: update all callers, complete the migration,
  delete superseded code — supersession is the default; confirm
  replace-vs-add in one line only when genuinely ambiguous. Review findings
  never restructure a PR or rollout without confirmation. An unshipped feature
  has no compatibility surface: its experimental behavior is not a contract, so
  it earns no shim, no dual path, and no deprecation window.
- Name precisely: nouns and verbs that carry the mental model; no
  abbreviations; long-form flags; units and qualifiers last by descending
  significance (`latency_ms_max`).
- Comment liberally — intent, rationale, and non-obvious constraints only,
  never what the code does; this overrides a harness default to match the
  surrounding file's comment density. A blatantly true assertion beats a
  comment for a critical, surprising condition.
- Declare variables at the smallest scope, computed closest to use. Extract
  configuration immediately: magic values live in config, not code.

## Properties

Each property is a class of defect plus the cheap floor that catches it.
Reach for the floor before the prose — the floor is the part that survives.

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

A side-effecting unit that emits nothing is not done. Ship the surface with
the unit; instrumentation retrofitted in a later pass is the defect.
Structured fields, not prose log lines; the correlation id on every record
on the path.

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
