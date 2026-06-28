---
name: rust-best-practices
description: Use when reading or writing Rust files (.rs, Cargo.toml).
---

# Rust Best Practices

Follows type-first, functional, and error handling patterns from AGENTS.md. This skill covers Rust-specific idioms only.

**The verifier is the taste.** `cargo clippy --all-targets --all-features -- -D warnings`, `cargo fmt --check`, and `cargo test` (incl. doctests) decide done — not the model's confidence. Clippy's `style`/`complexity`/`perf` groups *are* a published encoding of most rules below; let them run before claiming an idiom is followed. Baseline lint config: [TOOLING.md](TOOLING.md).

## Make Illegal States Unrepresentable

This is Rust's highest-leverage move: push invariants into types so the compiler is the checker.

**Newtypes for domain primitives** — distinct types stop argument-swap bugs at zero runtime cost:
```rust
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
struct UserId(u64);   // a u64 is not a UserId; the compiler enforces it
```

**Parse, don't validate** — a checker returns a *parsed type* that carries proof of validity, not a `bool`. Fallible construction returns `Result`; expose it as `TryFrom`/`FromStr`:
```rust
struct Email(String);
impl Email { fn parse(s: &str) -> Result<Self, EmailError> { /* ... */ } }
// not: fn is_valid_email(s: &str) -> bool   // throws the proof away; downstream re-checks
```

**Enums over bool/Option soup** — model mutually exclusive states as variants; attach data only to the state that owns it:
```rust
enum Connection { Disconnected, Connecting { since: Instant }, Connected { socket: TcpStream } }
// a struct { connected: bool, socket: Option<TcpStream> } permits connected:true, socket:None
```

**`NonZero<T>`** for "can't be zero" invariants — also gives `Option<NonZero<T>>` the niche, so it costs no extra space. **Typestate** encodes a state machine in types so invalid transitions don't compile — see [TRAITS-AND-GENERICS.md](TRAITS-AND-GENERICS.md).

**`#[must_use]`** on types/functions where dropping the result is a bug (builders mid-chain, guards, pure queries, error-like returns) — the compiler flags the dropped value.

## Ownership Is API Design

Signatures encode an ownership contract. Get it right and callers never clone to satisfy you.

**Accept the most general borrowed form** — widens the caller set at no cost:
```rust
fn greet(name: &str) {}              // &str, not &String
fn sum(xs: &[i32]) -> i32 {}         // &[T], not &Vec<T>   (clippy::ptr_arg)
fn open(p: impl AsRef<Path>) {}      // &str | String | Path | PathBuf
fn new(name: impl Into<String>) {}   // ergonomic owning constructor
```

**Take ownership only when you keep it** (C-CALLER-CONTROL) — by value if you store/consume it, by reference if you only read. Never `fn f(x: &T) { let x = x.clone(); }` — that steals the caller's choice of when to copy.

**No reflexive `.clone()`.** `Copy` clones and `Arc::clone` (a refcount bump — prefer `Arc::clone(&x)` over `x.clone()` for intent) are cheap and fine. A deep clone to dodge the borrow checker is a smell — the design wants a restructure (split borrows, indices, or returning data).

**`Rc<RefCell<T>>` / `Arc<Mutex<T>>` is a smell until proven otherwise.** Legitimate for genuinely shared ownership (graphs, caches) or genuinely shared state across threads. When the data is really a tree or sequence, an arena (`slotmap`, generational index) or threading `&mut` through is simpler and checked at compile time, not at runtime via panics/deadlocks.

**`Cow<'_, str>`** to return borrowed on the common no-op path and owned only when you changed something. **Lifetimes:** lean on elision; spend an explicit lifetime only when a returned reference is tied to a *specific* input. Avoid references-in-structs unless the struct genuinely *is* a borrowed view (a parser, a slice window) — lifetime params are infectious to every holder.

## Iterators and Functional Style

**Chains over index loops** — lazy, bounds-check-free, no off-by-one:
```rust
let total: u32 = items.iter().filter(|i| i.active).map(|i| i.cost).sum();
```

**`collect()` into the right type, including `Result`** — transposes `Iterator<Item = Result>` into `Result<Vec<_>>` and short-circuits on the first error:
```rust
let nums = lines.iter().map(|s| s.parse::<i32>()).collect::<Result<Vec<_>, _>>()?;
```
For an accumulator with early-exit-on-error, use `try_fold`. Don't `collect()` into a `Vec` only to iterate it once (`clippy::needless_collect`); use `.copied()`/`.cloned()` to lift `&T`→`T`, and the `entry` API for single-lookup map updates.

**`let-else`** for guard-binding without rightward drift:
```rust
let Some(user) = lookup(id) else { return Err(NotFound); };
```
Let-chains (`if let Some(a) = x && let Some(b) = y`) are **edition-2024 only** (stable 1.88) — don't use them in a 2021 crate.

## Naming and Conversions

These are the C-* conventions from the Rust API Guidelines — they make a codebase self-consistent and discoverable.

- **`as_` / `to_` / `into_`** encode cost + ownership: `as_` = free borrow→borrow, `to_` = expensive (allocates), `into_` = consumes `self`. Picking the wrong prefix lies to the caller.
- **No `get_` prefix** on getters: `fn first(&self) -> &T`, `fn first_mut(&mut self) -> &mut T`.
- Implement **`From`/`TryFrom`/`AsRef`**, never `Into`/`TryInto` — the reverse direction comes free via blanket impls. Implement **`FromStr`** to unlock `.parse()`.
- Constructors are static inherent methods: `new` for the primary one, `from_*` for conversions, domain verbs for I/O (`File::open`, `TcpStream::connect`).

Deeper trait/generic taste (eager common-trait impls, sealed traits, `dyn` vs `impl Trait` vs generics, builders, `#[non_exhaustive]`) is in [TRAITS-AND-GENERICS.md](TRAITS-AND-GENERICS.md).

## Error Handling

The one rule is the **library-vs-binary split**, decided by *who handles the error*:

- **Library** (callers branch on the failure) → `thiserror` typed enums. Keep `anyhow`/`eyre` out of public signatures.
- **Binary** (top level just reports and exits) → `anyhow`, or `eyre`/`color-eyre` for pretty diagnostics.

`?` everywhere; `.unwrap()` is a documented invariant (`expect("why this can't fail")`) or a bug, never an error-handling strategy. Full idioms, granularity, `#[non_exhaustive]`, and the workspace bridge: [ERROR-HANDLING.md](ERROR-HANDLING.md).

## When to Reach Async

`async` is viral and only earns its keep under IO concurrency (many sockets/requests). For CPU-bound work use `rayon`/threads; for low fixed concurrency, threads are simpler. Don't async-color a call graph for fashion. Once you're in async, **cancellation safety** is the subtle, load-bearing topic — see [ASYNC.md](ASYNC.md).

## Advanced Topics

- **Error handling** (`thiserror`/`anyhow`/`eyre`, granularity, exit codes): [ERROR-HANDLING.md](ERROR-HANDLING.md)
- **Traits, generics & API evolution** (common-trait impls, sealed traits, `dyn`/`impl`/generic, builders, typestate, `#[non_exhaustive]`): [TRAITS-AND-GENERICS.md](TRAITS-AND-GENERICS.md)
- **Async** (tokio, `Send + 'static`, cancellation safety, backpressure): [ASYNC.md](ASYNC.md)
- **Unsafe discipline & Miri** (`// SAFETY:`, `# Safety` docs, encapsulation): [UNSAFE.md](UNSAFE.md)
- **Harness setup** (clippy/rustfmt/`[lints]`/`cargo-deny`/Miri commands + baseline config): [TOOLING.md](TOOLING.md)

## Edition

Default to **edition 2024** (Rust 1.85+). It changes real semantics: `if let` temporaries drop at the end of the `if` (enabling sound let-chains), RPIT captures all in-scope generics by default (narrow with `impl Trait + use<'a>`), and `unsafe fn` bodies are no longer implicitly unsafe blocks. When touching an older crate, match its edition rather than reaching for 2024-only syntax.

## References

- Rust API Guidelines: https://rust-lang.github.io/api-guidelines/
- Clippy lint index: https://rust-lang.github.io/rust-clippy/master/index.html
- The Rust Reference: https://doc.rust-lang.org/reference/
- Edition 2024 guide: https://doc.rust-lang.org/edition-guide/rust-2024/
