---
name: agent-operability
description: Use when designing or changing a CLI, API, control plane, or automation surface that an agent must inspect, operate, and verify safely.
---

# Agent Operability

Design the public surface so a caller can complete a bounded control loop:

```
inspect -> plan -> apply -> verify
```

People and agents need the same semantics. Human-readable output is a view;
stable machine-readable output is the contract. A wrapper that scrapes prose or
reaches into storage is evidence that the public surface is incomplete.

## Control loop

### Inspect

- Expose current and desired state without mutation. Return stable resource and
  operation identifiers, lifecycle state, generation/version, relevant
  conditions, and timestamps.
- Offer structured output with a documented schema or version. Keep field names
  and enum values stable; send diagnostics to a separate channel from data.
- Make collections complete: provide pagination tokens and either a total or an
  explicit `has_more`. An empty result distinguishes `none` from `query failed`.

### Plan

- Resolve and echo the exact target, current generation, desired change,
  preconditions, and destructive or irreversible effects before applying.
- Give plan and apply the same validation. A dry run that skips permissions,
  lookup, conflict checks, or schema validation manufactures confidence.
- Make the preview bindable to apply with a plan identifier, digest, or expected
  generation. If state changes, reject or re-plan; never silently apply a stale
  preview.

### Apply

- Require explicit targets and explicit opt-in for destructive effects. Do not
  infer an environment, account, namespace, or data-bearing resource when a
  wrong guess is costly.
- Make retries safe through idempotency keys, convergent desired state, or an
  equivalent duplicate detector. Publish externally visible state atomically or
  leave a recoverable checkpoint.
- Return a stable operation identifier even when work completes immediately.
  Distinguish accepted, changed, unchanged, conflicted, invalid, unauthorized,
  and failed outcomes with structured status and reliable exit codes.

### Verify

- Let callers retrieve an operation by identifier and inspect the resulting
  resource generation. Long-running work has explicit terminal states such as
  `succeeded`, `failed`, `cancelled`, and `timed_out`; absence is not success.
- Provide a condition-based wait or watch with a caller-supplied deadline and
  cancellation. Bounded backoff is valid when no event source exists, but the
  observed condition—not elapsed time—decides success.
- Preserve enough failure context to diagnose the operation from emitted
  artifacts without rerunning it or enabling new instrumentation.

## Evidence envelope

A successful response is not completion evidence by itself. Verification
records identify what was actually observed:

- source revision and dirty-state digest;
- built artifact or image digest;
- target environment and resolved resource identifiers;
- verifier/task identifier and relevant input or charter version;
- start/end time, terminal result, and links or paths to retained artifacts.

A mutation invalidates every downstream result it can affect. Reuse is sound
only when the evidence identity is unchanged; record that comparison instead of
rerunning merely because time passed.

## Authority and secrets

- Carry authority and provenance in the call context rather than ambient
  fallback credentials. The operation records who or what requested it and the
  scope it was allowed to affect.
- Accept secret references or a protected stdin/descriptor channel. Never
  require plaintext secrets in argv, chat, logs, generated plans, or ordinary
  files; if the underlying tool offers only those channels, the surface is not
  safely operable and the action stops at the boundary.
- On shared systems, attribute ownership before mutation. A name, age, or
  matching pattern narrows discovery but does not prove authority.

## Verification floor

Exercise the assembled interface as a caller that has not seen its
implementation reasoning:

1. inspect an existing and an absent resource;
2. preview then invalidate a plan through concurrent state change;
3. apply twice and observe a no-op or the same operation;
4. disconnect from an in-flight operation, resume by identifier, and reach a
   bounded terminal;
5. provoke invalid input, conflict, denied authority, timeout, and partial
   dependency failure; and
6. attach the resulting evidence to the exact candidate and target it observed.

Use deterministic contract checks for objective schemas and transitions. Use a
fresh task runner only for the assembled behavior those checks cannot decide.

## Red flags

- Success inferred from a zero exit code while work continues elsewhere
- JSON that is merely a serialization of unstable human prose
- An unpaginated list used to prove absence
- A dry run that exercises fewer preconditions than apply
- Retrying a non-idempotent effect after an unknown outcome
- Polling forever or treating a duration as proof of convergence
- Evidence named only by command and `passed`
- A convenience wrapper that puts a secret in argv or an environment dump
