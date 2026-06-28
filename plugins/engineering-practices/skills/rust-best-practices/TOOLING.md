# Tooling — The Harness

Clippy is the closest thing to a published oracle of Rust taste; its `style`/`complexity`/`perf` lints encode most of what SKILL.md preaches. Make it the verifier, not an afterthought. Requires Cargo 1.74+ for the `[lints]` table; clippy ships with the toolchain.

## Commands

```bash
# CI gate: lint every target under all features, warnings are fatal.
cargo clippy --all-targets --all-features --workspace -- -D warnings

# Formatting gate (no writes, non-zero exit on drift):
cargo fmt --all --check

# Tests incl. doctests:
cargo test --all-features --workspace

# Local autofix (review the diff afterward):
cargo clippy --fix --all-targets --all-features && cargo fmt --all

# Supply-chain / license / advisory gate:
cargo deny check

# UB detection for unsafe code:
cargo +nightly miri test
```

The idiomatic split: **lint *levels* live in `Cargo.toml` as `warn`** (local builds and the IDE stay usable), and **CI promotes them with `-D warnings`** (strict at the gate). Don't bake `deny` into the table — it fights iteration.

## Lint groups — where each belongs

| Group | Default | Policy |
|---|---|---|
| **correctness** | deny | Real bugs. Leave at deny. |
| **suspicious** | warn | Enable. |
| **style / complexity / perf** | warn | Enable — this *is* the taste layer. (These five = `clippy::all`.) |
| **pedantic** | allow | **Opt in at `warn`**, then `#[allow]` the few that don't fit. Best taste-per-token. |
| **nursery** | allow | **Cherry-pick individual lints** — never the whole group (false positives). |
| **cargo** | allow | Enable at `warn`; cheap `Cargo.toml` hygiene. |
| **restriction** | allow | **Never as a group** — lints here contradict each other. Cherry-pick (`unwrap_used`, `dbg_macro`, …). |

## Baseline `[lints]` config

Drop into `Cargo.toml` (or `[workspace.lints.*]` + `[lints] workspace = true` in members). The `priority = -1` on each group is required so the individual overrides below win — Cargo's order *within* a priority is unspecified, and clippy's `lint_groups_priority` lint flags the ambiguity and fails the `-D warnings` gate.

```toml
[lints.rust]
unsafe_code = "forbid"           # forbid > deny: an inner #[allow] can't re-enable it.
                                 # downgrade to "deny" if you have audited unsafe to allow-list.
missing_docs = "warn"            # public items carry doc comments (libraries especially)
unreachable_pub = "warn"         # `pub` that isn't reachable -> tighten to pub(crate)
unused_qualifications = "warn"

[lints.clippy]
all      = { level = "warn", priority = -1 }   # correctness+suspicious+style+complexity+perf
pedantic = { level = "warn", priority = -1 }   # opinionated idiom layer
cargo    = { level = "warn", priority = -1 }   # Cargo.toml hygiene
# Do NOT add `nursery` or `restriction` as groups — cherry-pick from them below.

# pedantic opt-outs: high-noise, low-signal for most codebases
module_name_repetitions = "allow"   # `foo::FooError` is idiomatic
missing_errors_doc      = "allow"   # re-enable for a polished public API
missing_panics_doc      = "allow"

# cherry-picked nursery lints (stable enough to be worth it)
use_self          = "warn"          # `Self` over the concrete type name inside impls
equatable_if_let  = "warn"

# cherry-picked restriction lints: panic/debug hygiene for shipped code
unwrap_used = "warn"                # force explicit handling — DROP in test-only crates
expect_used = "warn"
dbg_macro   = "warn"                # no stray dbg!() committed
todo        = "warn"
# indexing_slicing = "warn"         # enable deliberately for panic-hardened paths
```

Scope `unwrap_used`/`expect_used` out of tests and binaries (per-crate `[lints]` or `#![cfg_attr(test, allow(...))]`) — they're for production library code.

## `clippy.toml` — project policy clippy can't infer

```toml
msrv = "1.85.0"                     # don't suggest APIs newer than your MSRV
avoid-breaking-exported-api = true
disallowed-methods = ["std::time::Instant::now"]   # ban an exact API with a reason
disallowed-types   = []
```
`disallowed-{methods,types,macros}` is the strongest codified-taste lever — ban a specific API outright with a custom message.

## `rustfmt.toml`

`cargo fmt` is non-negotiable formatting below the lint layer. Most knobs are nightly-only and silently no-op on stable — keep them out unless the whole team runs nightly rustfmt.
```toml
edition = "2024"     # MUST match the package edition or formatting differs
max_width = 100      # the one knob most teams touch
```
