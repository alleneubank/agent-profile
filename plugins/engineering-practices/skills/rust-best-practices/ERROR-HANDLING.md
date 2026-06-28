# Error Handling

Extends the library-vs-binary split from SKILL.md. Versions current as of early 2026: `thiserror` 2.x, `anyhow` 1.x, `eyre`/`color-eyre` active. `core::error::Error` is stable (Rust 1.81), so the `Error` trait, `thiserror`, and `anyhow` work in `no_std` (with default features disabled) — but `eyre`/`color-eyre` require `std`.

## The decision

Litmus test: *will the caller make a control-flow decision based on this error?*

- **Yes → typed errors (`thiserror`).** The caller needs to `match` variants and walk `source()`.
- **No, just log/exit → opaque (`anyhow` / `eyre`).** Keep the happy path clean with `?` + `.context()`.

Never put `anyhow::Error` in a library's public signatures — it erases the types the caller needed (`anyhow::Error` deliberately doesn't even impl `std::error::Error`, which is the tell that it's a binary-only type).

## Library errors — `thiserror`

```rust
use thiserror::Error;

#[derive(Debug, Error)]
#[non_exhaustive]                              // public enums: adding variants stays non-breaking
pub enum ConfigError {
    #[error("config file not found: {path}")]
    NotFound { path: std::path::PathBuf },

    #[error("invalid TOML at line {line}")]
    Parse { line: usize, #[source] source: toml::de::Error },

    #[error(transparent)]                      // forward Display + source() to the inner error
    Io(#[from] std::io::Error),                // #[from] generates From and implies #[source]
}
```

- `#[error("…")]` interpolates fields (`{path}`, positional `{0}`, `{self.x}`).
- `#[from]` generates `From` + links the source (one per source type); `#[source]` links a cause *without* `From`; `#[error(transparent)]` is the idiomatic "wrap an inner error verbatim."
- A `backtrace: std::backtrace::Backtrace` field is captured automatically.

**Granularity tracks the caller's decision points.** Prefer per-module / per-operation error types over one crate-wide mega-enum — a kitchen-sink enum couples unrelated subsystems, and every `?` with `#[from]` silently widens it and leaks internal failure modes. For a small, stable public surface, the std-style **opaque struct + kind enum** is often better than exposing the enum at all — this is what `std::io::Error` (`+ ErrorKind`), `reqwest::Error` (`is_timeout()`/`is_connect()`), and `serde_json::Error` (`category()`) do. Use explicit `.map_err(...)` instead of `#[from]` when auto-conversion would leak an implementation-detail type into your public enum.

`#[non_exhaustive]` belongs on **public** error enums (forces downstream `match` to carry `_ =>`); skip it on crate-internal errors.

## Binary errors — `anyhow` / `eyre`

```rust
use anyhow::{Context, Result, bail, ensure};

fn load(path: &Path) -> Result<Config> {
    let text = std::fs::read_to_string(path)
        .with_context(|| format!("reading config {}", path.display()))?;  // lazy context
    ensure!(!text.is_empty(), "config {} is empty", path.display());
    toml::from_str(&text).context("parsing config")                       // any E: Error
}

fn main() -> Result<()> {            // Debug impl prints the full source chain + backtrace
    load("app.toml".as_ref())?;
    Ok(())
}
```

- `.context()` / `.with_context(|| …)` (also on `Option`); macros `anyhow!`, `bail!`, `ensure!`.
- **Recover a typed error at the boundary:** `err.downcast_ref::<ConfigError>()` — this is how a binary on `anyhow` still acts on a library's typed error.
- Backtrace captured when `RUST_BACKTRACE=1` (or `RUST_LIB_BACKTRACE=1`).

**`eyre` / `color-eyre`** is `anyhow` with a swappable report handler; `color-eyre` renders colored output, backtraces, `tracing` spantraces, and help sections. Worth it for user-facing CLIs/services. One-time setup:
```rust
fn main() -> color_eyre::Result<()> { color_eyre::install()?; real_main() }
```
Never mix `anyhow` and `eyre` in one crate — same machinery, non-interchangeable macros; pick one per crate.

**Exit codes.** `fn main() -> Result<(), E: Debug>` exits `1` and prints `Debug`. For custom codes, return `std::process::ExitCode`, or downcast in a thin `real_main` wrapper and map to a code — that's a top-level concern, never decided mid-flow.

## Workspace with both

Each library sub-crate defines its own `thiserror` error(s); the binary crate uses `anyhow`/`eyre` at the top. The bridge is **`?` (auto-`From`) on the way up, `downcast_ref` on the way out**.

## Idioms

- `Option → Result`: `.ok_or_else(|| MyErr::Missing)?` (lazy beats `.ok_or(...)`).
- Convert: `.map_err(MyErr::from)?` or `.map_err(|e| MyErr::Wrap(e))?`.
- Defaults over panics: `.unwrap_or`, `.unwrap_or_else`, `.unwrap_or_default`.
- Propagate, don't unwrap: `?` everywhere; reserve panics for invariant violations.

## Red flags

- **`.unwrap()` / `.expect()` in a library happy path or on user-influenced input** — return `Result`. Acceptable only in tests, examples, prototypes, and provable invariants — and there, `expect("why this cannot fail")` documents the invariant. Enforce with `#![deny(clippy::unwrap_used, clippy::expect_used)]` in library crates (scope it out of `#[cfg(test)]`).
- **`panic!` for recoverable/expected failures** — panics are for bugs, not control flow. A library panic a caller can trigger is an API defect.
- **Swallowing errors** (`let _ = fallible();`, `.ok()` to discard) — handle or propagate.
- **Dropping the source chain** — always link the cause via `#[source]`/`#[from]`.
- **`anyhow`/`eyre` in a library's public API**; **one crate-wide mega-enum** with reckless `#[from]`; **stringly-typed `Result<T, String>`** in anything reusable.

## Currency notes

`try` blocks and `std::error::Report` remain **nightly** as of early 2026 — anyhow/eyre exist precisely to fill that gap; don't write a skill around them. Know but don't default to **`miette`** (diagnostic-rich, compiler/CLI tooling) or **`error-stack`** — the boring correct default stays thiserror (libraries) + anyhow/eyre (binaries).
