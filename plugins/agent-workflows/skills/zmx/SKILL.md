---
name: zmx
description: Use when starting dev servers, watchers, tilt, or any process expected to outlive the conversation. Provides zmx session management patterns for long-lived processes.
---

# zmx Process Management

Verified against zmx 0.7.0.

## Session Rules

- **`zmx run` is synchronous.** It blocks until the command exits. Anything
  that does not exit on its own — server, watcher, `tilt up` — needs `-d`.
- **`-d` goes after the session name.** `zmx run <name> -d <cmd>`. Placing it
  first (`zmx run -d <name>`) creates a session literally named `-d`.
- **Never quote the command.** Arguments are passed as-is to `bash`, not
  through a shell string. `zmx run s 'npm run dev'` looks for a binary named
  `npm run dev` and fails with exit 127.
- Check `zmx list --short` before creating sessions — duplicates cause port
  conflicts and confusing output
- Derive session name from `git rev-parse --show-toplevel` — hardcoded names
  collide when multiple agent instances run concurrently
- Never `zmx attach` or `zmx tail` from an agent turn — both block

One project = one session prefix. Multiple processes = multiple sessions
sharing the prefix.

## Session Naming

```bash
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
PROJECT="$(basename "$ROOT")"
```

Take the fallback *before* `basename`, not after: `basename ""` succeeds with
empty output, so `basename "$(git ...)" || basename "$PWD"` never reaches its
fallback and yields an empty `PROJECT` outside a git repo.

All subsequent examples assume `PROJECT` is set. Session names follow
`${PROJECT}-<role>`: `myapp-server`, `myapp-tests`, `myapp-tilt`.

## Starting Long-Lived Processes

Three things have to hold at once: detached, unquoted, and verified. A command
that dies on startup still leaves a live session behind, so the session
existing is not proof anything is running.

Pass the command as trailing arguments and forward them with `"$@"`. This is
the one form that survives both shells — see the word-splitting note below.

```bash
zmx_start() {
  session="$1"; shift
  if zmx list --short 2>/dev/null | grep -q "^${session}$"; then
    echo "Already running: $session"
    return 0
  fi
  zmx run "$session" -d "$@"
  sleep 2
  # `zmx run` appends ZMX_TASK_COMPLETED:<code> when the command exits.
  # For a process that should stay up, that marker means it died.
  if zmx history "$session" 2>/dev/null | tail -5 | grep -q 'ZMX_TASK_COMPLETED:'; then
    echo "FAILED to stay up: $session"
    zmx history "$session" 2>/dev/null | tail -20
    return 1
  fi
  echo "Started: $session"
}

zmx_start "${PROJECT}-server" npm run dev
zmx_start "${PROJECT}-tests" npm run test:watch
```

### Word splitting differs between bash and zsh

Holding the command in a plain string and expanding it unquoted works in bash
and silently fails in zsh, which does not word-split unquoted expansions:

```bash
CMD='npm run dev'
zmx run "$SESSION" -d $CMD     # bash: 3 args. zsh: ONE arg -> exit 127.
```

Use `"$@"` as above, or an array — `arr=(npm run dev)` expanded as
`"${arr[@]}"` — both of which mean the same thing in either shell. Do not
reach for `shellcheck disable=SC2086` here; it papers over a real portability
break rather than a lint false positive.

## Running Tasks That Finish

For a command that terminates, blocking is the point — `zmx run` exits with
the command's own status:

```bash
zmx run "${PROJECT}-main" cat README.md      # blocks, returns command's exit code
```

To run several concurrently, detach and collect. `zmx wait` **propagates the
task's exit code**, so it is a real pass/fail gate, not just a barrier:

```bash
zmx run "${PROJECT}-build" -d make build
zmx run "${PROJECT}-lint" -d make lint

zmx wait "${PROJECT}-build" || echo "build failed rc=$?"
zmx wait "${PROJECT}-lint"  || echo "lint failed rc=$?"

zmx wait "${PROJECT}-*"                      # prefix glob: wait for all
```

`zmx list` also carries the last exit status per session as an `exit_code=`
field.

## Sending Input

`zmx run` redirects stdin from `/dev/null` so pagers and prompts cannot block.
Pipe data explicitly when a command needs stdin:

```bash
echo "some data" | zmx run "${PROJECT}-main" -d cat

# Raw PTY input for TUIs / interactive prompts — no completion marker, no exit code.
# Text is sent byte-for-byte; append \r yourself to execute.
printf 'echo hello\r' | zmx send "${PROJECT}-main"
```

## Monitoring Output

```bash
zmx history "${PROJECT}-server" | tail -50                   # last 50 lines
zmx history "${PROJECT}-server" | rg -i "error|fail"         # check for errors
zmx history "${PROJECT}-server" | rg -i "listening|ready"    # check for ready
```

Never use `zmx tail` in an agent turn — it follows the stream and blocks until
killed. `zmx history | tail -N` is the bounded read.

## Labels

Labels are in-memory, scoped to session lifetime, and useful for marking what
a session is or how it ended:

```bash
zmx set "$SESSION" project="$PROJECT" role=server
zmx get "$SESSION"                     # project=myapp role=server
zmx get "$SESSION" role                # server
zmx set "$SESSION" role=               # remove one label
zmx clear "$SESSION"                   # remove all

zmx list | grep "project=${PROJECT}"   # filter by label
```

`zmx list --where k=v` does **not** filter — it returns every session
regardless of the predicate. Filter with `grep` over `zmx list`, as zmx's own
help documents. More generally, `zmx list` silently ignores flags it does not
implement rather than erroring, so an unrecognized flag reads as success.

A process can label itself: `.` resolves to the current session, and
`ZMX_SESSION` is injected automatically. This turns readiness into a signal
instead of a guess, when you control the command:

```bash
zmx run "$SESSION" -d sh -c 'until curl -sf localhost:3000/health; do sleep 1; done; zmx set . status=ready; exec npm run dev'
```

## Lifecycle

```bash
zmx list                                 # all sessions, with labels and exit codes
zmx list --short                         # names only, one per line
zmx kill "${PROJECT}-server"             # kill one
zmx kill "${PROJECT}-*"                  # kill all of this project's sessions
```

`zmx kill "${PROJECT}-*"` accepts multiple arguments and prefix globs, so it
replaces a read-and-kill loop. Bare `zmx kill "*"` is broken in 0.7.0 — it
returns rc=1 and kills nothing — which is just as well: scope kills to the
project prefix regardless.

`zmx list` prints "no sessions found" to stderr, so empty stdout under
`2>/dev/null` is the correct emptiness test.

## Isolation

- Only kill sessions matching the current project prefix — other agent
  instances may have their own sessions running
- Always verify the session name before kill operations
- `ZMX_SESSION_PREFIX` prepends to names at creation, but `zmx list` reports
  the prefixed name while your guard tests the unprefixed one — leave it unset
  unless every call in the workflow sets it identically

## When to Use zmx

| Scenario | Use zmx? |
|----------|----------|
| `tilt up` | Yes, always (`-d`) |
| Dev server (`npm run dev`, `rails s`) | Yes (`-d`) |
| File watcher (`npm run watch`) | Yes (`-d`) |
| Test watcher (`npm run test:watch`) | Yes (`-d`) |
| Database server | Yes (`-d`) |
| Long build you want to parallelize | Yes (`-d` + `zmx wait`) |
| One-shot build (`npm run build`) | No |
| Quick command (<10s) | No |
| Need stdout directly in conversation | No |

## Waiting for Readiness (bounded, last resort)

`zmx wait` blocks on task *completion*, so it cannot express "server is
ready" — a server that becomes ready never completes. Prefer the self-labeling
pattern above when you control the command. Otherwise a single bounded loop
with an explicit iteration cap stands in for the one blocking wait. This is
not a license to poll: run it once per startup, and if a check returns nothing
new twice, stop and reassess instead of burning the cap.

```bash
for i in {1..30}; do
  if zmx history "${PROJECT}-server" 2>/dev/null | tail -20 | rg -q "listening|ready"; then
    echo "Server ready"
    break
  fi
  sleep 1
done
```

## Version Notes

- 0.7.0 — `zmx run` executes under `bash`, not `$SHELL`; the target shell must
  support `$?`. `zmx tail` strips ANSI escapes; `zmx history` keeps them only
  under `--vt`. Logs moved to `XDG_STATE_DIR`.
- 0.5.0 — `zmx run` became synchronous (`-d` restores the old behavior), and
  `kill`/`wait` gained prefix-glob matching.
