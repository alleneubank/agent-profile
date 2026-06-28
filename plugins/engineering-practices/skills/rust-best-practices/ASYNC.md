# Async Rust (tokio)

Current as of early 2026 / edition 2024. The when-to-async gate is in SKILL.md — apply it first.

## Runtime

`tokio` is the default. Multi-thread runtime (`#[tokio::main]`) work-steals and requires spawned tasks be `Send`; current-thread (`flavor = "current_thread"`) is single-threaded and drops the `Send` requirement — good for tests and pinned work.

```rust
#[tokio::main]                                       // multi-thread
async fn main() { /* ... */ }

#[tokio::main(flavor = "current_thread")]            // single-threaded
async fn main() { /* ... */ }
```

**Library code must not impose a runtime** — take `impl Future`, let the binary own `#[tokio::main]`.

## `Send + 'static` and guards across `.await`

`tokio::spawn` requires `F: Future + Send + 'static`, and a future is `Send` iff every value held alive across an `.await` is `Send`. Holding an `Rc`, a `RefCell` ref, or a `std::sync::MutexGuard` across `.await` makes the whole future `!Send` — the most common async compile error.

```rust
// BAD: std guard lives across .await -> !Send future + deadlock risk
let mut g = state.lock().unwrap();
g.count += 1;
do_io().await;            // guard still held

// GOOD: mutate, drop the guard, then await
{ let mut g = state.lock().unwrap(); g.count += 1; }   // dropped here
do_io().await;
```

**Mutex choice:** use `std::sync::Mutex` (or `parking_lot`) for plain data and drop the guard before awaiting. Reach for `tokio::sync::Mutex` **only** when you must hold the lock across an `.await` (e.g. guarding an IO resource) — it's more expensive for exactly that reason. For genuinely `!Send` work, use `spawn_local` inside a `LocalSet`.

## Cancellation safety — the load-bearing topic

**Definition (tokio):** a future is cancel-safe if it's a no-op to drop it before completion and recreate it — dropping mid-flight loses no state.

**Why it bites:** `tokio::select!` polls several futures and, the instant one is ready, **drops all the other branches' futures**. A dropped future holding partial work (bytes read, a dequeued message) loses that work *silently*. This is the canonical async data-loss bug.

**Cancel-safe** (fine as bare `select!` branches): `mpsc/broadcast::Receiver::recv`, `watch::Receiver::changed`, `TcpListener::accept`, `AsyncReadExt::read`/`read_buf`, `AsyncWriteExt::write`/`write_buf`, `StreamExt::next`.

**NOT cancel-safe** (dropping loses data / queue position): `read_exact`, `read_to_end`, `read_to_string`, `write_all`, and `Mutex::lock` / `RwLock::{read,write}` / `Semaphore::acquire` / `Notify::notified` (you lose your place in the FIFO queue).

```rust
// BAD: read_exact isn't cancel-safe; when the timer wins, already-read bytes vanish.
loop {
    tokio::select! {
        r = socket.read_exact(&mut buf) => handle(r)?,
        _ = interval.tick()             => heartbeat(),
    }
}
```

Three ways to write cancel-safe loops:
1. **Only branch on cancel-safe ops** (`recv`/`read`/`next`/`accept` + `CancellationToken::cancelled`).
2. **Pin the non-cancel-safe future outside the loop** so a not-ready branch resumes instead of restarting:
   ```rust
   let read = socket.read_exact(&mut buf);
   tokio::pin!(read);
   loop {
       tokio::select! {
           r = &mut read => { handle(r)?; break; }   // resumed, not dropped+restarted
           _ = interval.tick() => heartbeat(),
       }
   }
   ```
3. **Move the op into its own task** and `select!` on a channel / `JoinHandle`.

**Graceful shutdown:** `tokio_util::sync::CancellationToken` (its `cancelled()` is cancel-safe) propagates a stop signal through a task tree. Dropping a `JoinHandle` does **not** stop the task; `handle.abort()` cancels at the next `.await` (it can't interrupt blocking/sync code).

## Never block the executor

A synchronous blocking call (`std::fs`, `std::thread::sleep`, a blocking DB driver, a tight CPU loop) parks the whole worker thread and starves every task on it; on current-thread it freezes everything.

```rust
let out = tokio::task::spawn_blocking(move || expensive_sync_work(input)).await?;
```

Heavy CPU parallelism → `rayon`, not the async runtime. Never `std::thread::sleep` in async — use `tokio::time::sleep`. If you can't tell whether a third-party call blocks, assume it does.

## async fn in traits (AFIT)

Native `async fn` in traits + RPITIT is stable (Rust 1.75) and is the default — static dispatch, zero allocation:
```rust
trait Fetch { async fn get(&self, url: &str) -> Result<Bytes, Error>; }
```
Two caveats: native AFIT is **not yet dyn-compatible**, so trait objects (`Box<dyn Fetch>`) still need `#[async_trait]` (which boxes each future); and a `Send` bound on the returned future is awkward to write — use `#[trait_variant::make]` to generate a `Send` variant for multi-thread runtimes.

## Structured concurrency & backpressure

Prefer scoped joining over fire-and-forget `spawn`, so child lifetimes are bounded and failures propagate:
- `tokio::join!` / `try_join!` — run several futures on the current task; `try_join!` fails fast.
- `JoinSet` — dynamic spawn-N-await-all; **dropping it aborts the rest** (no orphans).
- `FuturesUnordered` — many futures on one task (no spawn, so `!Send` is fine).

A bare `tokio::spawn` whose `JoinHandle` is dropped runs detached — its panic is swallowed and it outlives its logical parent. Use `JoinSet`/`join!` when you care about completion or failure.

**Backpressure = bounded channels.** `tokio::sync::mpsc::channel(N)` suspends the producer when full. Avoid `unbounded_channel` — a fast producer outruns a slow consumer until OOM; use it only when the producer is provably rate-limited elsewhere. For capped concurrency over a stream, `StreamExt::buffer_unordered(n)` / `for_each_concurrent(n)`.

## Red flags

- `std::sync::MutexGuard` / `Rc` / `RefCell` ref held across `.await` — `!Send` or deadlock.
- `tokio::sync::Mutex` guarding plain data — should be `std::sync::Mutex` + drop before await.
- Non-cancel-safe op (`read_exact`/`write_all`/`lock`/`acquire`) as a bare `select!` branch.
- Blocking call on an async worker — needs `spawn_blocking`/`rayon`/`tokio::time::sleep`.
- `unbounded_channel` — no backpressure.
- `.await` in a `for`/`while` loop that should be concurrent (`join!`/`buffer_unordered`/`JoinSet`) — *unless* each step genuinely depends on the last.
- Detached `tokio::spawn` whose handle is dropped — orphaned task, swallowed panic.
- A future built but never `.await`-ed — futures are lazy and do nothing until polled.
- async coloring with no concurrency payoff — threads/`rayon` are simpler.
