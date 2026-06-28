# Unsafe Discipline

`unsafe` is a contract, not an escape hatch: you assert invariants the compiler can no longer check, so each use must be minimal, encapsulated, and documented. The verifier here is Miri — see TOOLING.md.

## Forbid it where you can

For pure-logic crates, make any `unsafe` a compile error:
```rust
#![forbid(unsafe_code)]
```
Elsewhere, keep `unsafe` to a few reviewed modules and wrap it behind a sound safe API so callers can't violate the invariant.

## Every `unsafe` block states its invariant

A `// SAFETY:` comment naming the upheld invariant is mandatory — it's the proof obligation made explicit; a block without one is an unreviewable claim (`clippy::undocumented_unsafe_blocks` enforces it):
```rust
// SAFETY: `i < self.len` was bounds-checked on the line above, so the index is
// in-bounds and the pointer is valid for a read of T.
let x = unsafe { self.data.get_unchecked(i) };
```

In **edition 2024** an `unsafe fn` body is no longer an implicit unsafe block (`unsafe_op_in_unsafe_fn` warns) — you wrap unsafe ops in explicit `unsafe { }` *inside* it, each with its own `// SAFETY:`.

## `unsafe fn` documents the caller's contract

The `# Safety` doc section states what the *caller* must guarantee (`clippy::missing_safety_doc` enforces it):
```rust
/// # Safety
/// `ptr` must be non-null, aligned, and valid for `len` reads of `T`.
unsafe fn from_raw<'a, T>(ptr: *const T, len: usize) -> &'a [T] { /* ... */ }
```

## Run Miri on unsafe code

`cargo +nightly miri test` is an interpreter that detects UB normal tests pass over by luck: out-of-bounds, use-after-free, invalid aliasing (Stacked/Tree Borrows), uninit reads, misalignment. Reach for it whenever `unsafe` touches raw pointers, `transmute`, `MaybeUninit`, or a custom container.

## Don't go unsafe for performance without measuring

Benchmark the safe version first — LLVM elides most bounds checks already. `get_unchecked` and friends rarely beat the optimizer and trade real safety for usually-imaginary gains. Profile, prove the win, then localize the `unsafe` with a `// SAFETY:`.

## Edition 2024 unsafe changes

- `unsafe extern { }` blocks are required for FFI declarations.
- Unsafe attributes are written `#[unsafe(no_mangle)]` / `#[unsafe(export_name = …)]`.
- References to `static mut` are denied (`static_mut_refs`) — use `Mutex`/atomics/`SyncUnsafeCell` instead.
- Use `NonNull<T>` (covariant, never-null) rather than raw `*mut T` when building safe abstractions over pointers.
