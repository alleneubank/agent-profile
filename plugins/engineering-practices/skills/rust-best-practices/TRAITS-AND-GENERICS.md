# Traits, Generics & API Evolution

Rust-specific taste for designing types others (or future-you) build on. Most of this is driven by the orphan rule and semver, so it matters most at a **public crate boundary** — inside a leaf binary it's good hygiene but not load-bearing.

## Eagerly implement the standard traits

The orphan rule means a downstream crate *cannot* add these later — the author must. Derive them wherever they apply:

```rust
#[derive(Debug, Clone, PartialEq, Eq, Hash, Default)]
struct Config { /* ... */ }
```

- **`Debug` on every public type, never empty** — `{:?}` is universal tooling (logs, panics, test failures).
- **Implement `From`/`TryFrom`/`AsRef`/`AsMut`, never `Into`/`TryInto`** — the reverse comes free via blanket impls.
- **Error types** implement `std::error::Error` (gives `source()` chaining), are `Send + Sync + 'static`, and never use `()` as the error type.
- **Don't repeat derivable bounds on the struct** — `struct Wrap<T> { value: T }` with `#[derive(Clone)]`, not `struct Wrap<T: Clone>`. A bound on the *type* is a breaking change to remove; a `derive` is non-breaking to add. Put bounds on the `impl`, never on the struct, for `Clone`/`PartialEq`/`Debug`/`Default`/`Serialize`/etc.

Assert auto-traits you rely on, so a future field can't silently break them:
```rust
const _: () = { fn assert<T: Send + Sync>() {} let _ = assert::<MyType>; };
```

## `dyn` vs `impl Trait` vs generics

Choose deliberately:

- **Generics / `impl Trait` in argument position** — static dispatch, monomorphized, zero cost. Default. `fn f(x: impl AsRef<Path>)` over the turbofish `fn f<T: AsRef<Path>>(x: T)` when the param isn't nameable.
- **`-> impl Trait`** (return position) — hand back an unnameable type (iterator chains, futures) without a named struct. In **edition 2024** RPIT captures all in-scope generics/lifetimes by default; narrow with `-> impl Iterator<…> + use<'a>`.
- **`Box<dyn Trait>`** — runtime dispatch; reach for it only for heterogeneous collections (`Vec<Box<dyn Plugin>>`) or to break monomorphization bloat. Keep a trait **dyn-compatible** (formerly "object-safe") by fencing generic methods with `where Self: Sized`.

## Sealed traits & `#[non_exhaustive]`

Both let a public API evolve without a major version bump:

```rust
pub trait TheTrait: private::Sealed {           // downstream can't impl it…
    fn method(&self);
}
mod private { pub trait Sealed {} impl Sealed for usize {} }
```
A **sealed** trait can grow methods in a non-breaking release because no external impls exist to break. **`#[non_exhaustive]`** on a public enum/struct forces downstream `match`/construction to handle future additions, so adding variants/fields stays non-breaking.

## Builders for complex construction

Rust has no named/optional args; a builder fills the gap. Prefer the **non-consuming** form (`&mut self -> &mut Self`) so both one-liners and staged config work:
```rust
Command::new("ls").arg("-l").arg("-a").spawn()?;
```
Mark a partial builder `#[must_use = "call .build()"]`.

## Typestate — compile-time state machines

Encode each state as a distinct type; transitions consume `self` and return the next type, so invalid calls don't compile:
```rust
struct Draft;  struct Published;
struct Post<S> { body: String, _s: PhantomData<S> }
impl Post<Draft>     { fn publish(self) -> Post<Published> { /* ... */ } }
impl Post<Published> { fn views(&self) -> u64 { /* ... */ } }
// draft.views()   // error: no such method in the Draft state
```
The compiler becomes the state-machine checker — used by `embedded-hal` pin modes and builder finalization. Reserve it for genuinely stateful protocols; it adds type noise.

## Newtype to bypass the orphan rule

You can't `impl ForeignTrait for ForeignType`. Wrap it so a local type makes the impl legal:
```rust
struct Wrapper(Vec<String>);
impl std::fmt::Display for Wrapper { /* ... */ }
```
Add `Deref` only for transparent forwarding wrappers — never on a domain newtype, where it leaks the inner API and muddies method resolution.

## Smaller predictability rules

- **Private struct fields** — a `pub` field pins the representation forever; expose getters/setters to keep invariants.
- **Operators (`Add`/`Mul`/…) only for math-like semantics** — readers assume associativity etc.; surprising overloads are landmines.
- **`Deref` is for smart pointers only** — not to fake inheritance.
- **Return tuples/structs, not out-parameters** — `fn minmax() -> (T, T)`, not `&mut T` out-params (Rust returns compound values in registers). Exception: filling a caller's buffer (`read(&mut self, buf: &mut [u8])`).
- **Destructors never fail and never block** — `Drop` is best-effort; put fallible/blocking teardown in an explicit `close(self) -> Result<…>`.
