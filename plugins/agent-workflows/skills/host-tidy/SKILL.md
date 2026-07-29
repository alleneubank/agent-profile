---
name: host-tidy
description: Use when a dev host is overloaded, out of memory, or hitting fork/resource limits and stale localnets, orphaned dev daemons, or leftover containers need to be found and cleared safely
---

# host-tidy

Reclaim an overloaded dev host by finding processes and stacks whose **owner
is gone**, then clearing them without touching live work.

The whole skill is one discrimination: **orphan vs. active**. Getting it
wrong in one direction wastes a core for two weeks; getting it wrong in the
other destroys someone's running environment. Age alone never decides it —
attribution does.

## Hard rules

- **Never kill before attributing.** Every target needs a named reason its
  owner is gone (see Ownership evidence). "It is old" and "it looks stale"
  are not reasons.
- **Prefer the project's sanctioned teardown** over hand-killing PIDs and
  containers. A stack's own `down` command knows about halves you have not
  found yet.
- **Never remove a compose-managed container individually.** Tear the
  project down; a hand-removed member leaves the project wedged.
- **Proven orphans are interior — clear them and report.** Anything
  ambiguous, data-bearing, or shared batches into one confirmation.
- **An approval is bound to the evidence it was given on.** Attribution
  continues right up to the teardown command. If a target turns out to be
  live after it was approved, the approval is void — stop, say which
  evidence changed, and re-ask. Approval granted on a wrong premise is not
  authorization.
- **Disk reclaim is always opt-in and separate.** Never fold volume/image
  pruning into a process cleanup; volumes are the one irreversible step.
- **Shared hosts belong to other people too.** Confirm before clearing
  anything you did not start.

## Workflow

### 1) Measure before touching anything

Capture the baseline so the effect is provable afterward:

```bash
# macOS
uptime; sysctl -n hw.ncpu hw.memsize
vm_stat | awk '/Pages free/{gsub(/\./,"",$3); printf "free: %.0f MB\n", $3*16384/1048576}'
echo "procs: $(ps -A | wc -l)  limit: $(sysctl -n kern.maxprocperuid)"

# Linux
uptime; nproc; free -h
echo "procs: $(ps -e --no-headers | wc -l)"
ps -eo state --no-headers | sort | uniq -c   # D-state and Z counts
```

Then the shape of the load — a name histogram beats a top-N list, because
leaks show up as *counts*, not as one hot process:

```bash
ps -Ao comm | sed 's|.*/||' | sort | uniq -c | sort -rn | head -20   # macOS
ps -eo comm --no-headers | sort | uniq -c | sort -rn | head -20      # Linux
```

Hundreds of `postgres`, `nginx`, or runtime processes means a runaway stack,
not a stray process — go to step 2's container half first.

**Under severe load the container daemon itself starves.** Put explicit
timeouts on every `docker`/`kubectl` call, run long sweeps detached, and
never re-issue a hung command — that is piling on, not retrying.

### 2) Inventory both halves

Dev stacks leak in two halves and clearing one leaves the other running:

**Host processes** — anything reparented to init (`PPID 1`) after its
launcher died ungracefully:

```bash
ps -Ao pid,ppid,etime,%cpu,rss,command | awk '$2==1' \
  | grep -iE '\b(bun|node|deno|python[0-9.]*|tilt|vite|esbuild|java|cargo)\b' \
  | grep -vE '/Applications/|Cellar|/System/|/nix/store'
```

**Containers and clusters** — grouped by project, never by individual name:

```bash
timeout 30 docker ps -a --format '{{.Label "com.docker.compose.project"}}|{{.Names}}|{{.Status}}'
timeout 20 docker system df
timeout 20 k3d cluster list          # or: kubectl config get-contexts
```

A supervisor-driven localnet typically owns a compose project **and** a
cluster + registry. Also check the session multiplexer's own view (e.g.
`zmx ls`) — it records sessions the process table cannot explain.

### 3) Attribute ownership

For each candidate, find the strongest available evidence. Higher on this
list wins; a single hit is enough to classify.

| Evidence | How to read it |
|---|---|
| **The stack's own status command** | Ask the tool that owns the stack (`<project> status`, `silo status`, `tilt get`). A stack reporting **stopped** while its containers or cluster still run is an orphan by its own account; one reporting **running** is live. Cheapest and most authoritative — check it first |
| **Owning directory deleted** | `lsof -a -p <pid> -d cwd` (macOS) / `readlink /proc/<pid>/cwd` (Linux); compose: `docker inspect -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}'`. Gone directory → **orphan** |
| **Supervisor recorded an exit** | The multiplexer/supervisor lists the session as ended with an exit code while the process still runs → **orphan** (the directory may still exist — this outranks it) |
| **Waiting on a dead endpoint** | A poll loop against a port with no listener (`lsof -nP -iTCP:<port> -sTCP:LISTEN`) → **orphan** |
| **Scratch state already deleted** | Temp dir / socket / lock the process was built around is gone → **orphan** |
| **Recent commits in the owning worktree** | `git -C <dir> log -1 --format='%h %s (%cr)'` → **active**, leave it |
| **Live inbound connections** | Established sockets on the stack's service ports → **active**, leave it |
| **No owner found** | → **ambiguous**, batch for confirmation. Never promote to orphan by age |

Elapsed time only *ranks* orphans by cost. A 24-minute stack with a live
worktree is active work; a 13-day process with a deleted worktree is waste.

### 4) Classify into three tiers and report

- **Tier 1 — proven orphan.** Attribution evidence names the dead owner.
  Interior: clear it and report.
- **Tier 2 — ambiguous, data-bearing, or shared.** No owner found,
  anonymous volumes attached, or started by someone else. Batch into **one**
  confirmation with the evidence shown.
- **Tier 3 — busy but legitimate.** Report cost, propose nothing. This is
  where the real consumption usually is: an active stack is expensive
  because it is running, not because it leaked.

Present the tiers with cost per item before acting. Name explicitly what you
are **not** touching and why — that list is as useful as the kill list.

### 5) Tear down stacks with their own command

Discover the sanctioned teardown before improvising (`package.json` scripts,
`Makefile`, the project's README):

```bash
# example shape: supervisor down -> compose down -v -> generated env cleanup
<pkg-runner> run localnet:down
```

**Read what each teardown level actually does before picking one.** Projects
routinely ship a graduated pair — a `down` that stops the workload but
*keeps* the cluster, and a `clean`/`purge` that adds `--delete-cluster`. On
a host you are reclaiming, `down` leaves the multi-GB half you came for
still running. Check the script's own definition rather than guessing from
the verb.

Use the project's own package runner, not a habitual one — a repo whose
lockfile belongs to a different package manager will refuse to run, and the
wrapper's error is about the lockfile, not about your command being wrong.

Stop the **supervisor first** so it reaps its own children gracefully, then
run the teardown. Verify the child daemons and connections actually dropped
before moving on. Afterwards sweep for stragglers by project prefix —
side-stacks defined in a second compose file are routinely missed:

```bash
docker ps -a --format '{{.Names}}' | grep '<project-prefix>'
```

Only when no sanctioned teardown exists, remove the project by label:

```bash
docker rm -f $(docker ps -aq --filter "label=com.docker.compose.project=$P")
docker volume rm -f $(docker volume ls -q --filter "label=com.docker.compose.project=$P")
docker network rm $(docker network ls -q --filter "label=com.docker.compose.project=$P")
k3d cluster delete <cluster>      # the other half
```

Omit `-v` on `docker rm` when a container has **anonymous** volumes you did
not prove disposable — the process dies, the data survives on disk.

### 6) Kill with verify-before-signal, then escalate

PIDs get reused. Re-confirm identity immediately before signalling, in the
same command that signals:

```bash
cmd=$(ps -p "$PID" -o command= 2>/dev/null || true)
case "$cmd" in
  *<expected-substring>*) kill "$PID" && echo "TERM $PID" ;;
  *) echo "SKIP $PID (identity changed: '$cmd')" ;;
esac
```

Then SIGTERM → verify → SIGKILL only the survivors. A wedged process
ignoring SIGTERM is expected, not a surprise.

Before reaping duplicates of a **daemon that backs live sessions**, prove
which instance holds the live socket and exclude it:

```bash
lsof -nP <state-dir>/<name>.sock | awk 'NR>1{print $2}' | sort -u
```

Build the kill manifest by exclusion (dev/build paths in, installed path
out), print it, then execute — and re-check the socket afterward.

### 7) Verify and tally

Re-measure load, free memory, and per-class counts against step 1. State
each count as `now (was N)`.

**Load average lags** — it is a decaying 1/5/15-minute mean, so a freed core
shows up immediately in CPU but slowly in load. Cite the 1-minute number as
*decaying*, not as the result, and never claim a recovery the process counts
do not corroborate.

### 8) Name the leak, not just the mess

A sweep that does not identify why the host filled up guarantees a repeat.
Report the mechanism when the evidence supports one:

- **Ungraceful supervisor death** — foreground child processes started by a
  supervisor reparent to init when it is killed rather than shut down. Every
  long-running child is an orphan-in-waiting; random-port services accumulate
  invisibly because they never collide.
- **Host-scaled sizing with no cap** — connection pools, thread pools, and
  heaps sized to host cores/RAM. Fine for one stack, fatal for four
  concurrently. The fix is per-instance sizing plus a host-wide concurrency
  cap, not a bigger sweep.
- **No lifecycle/TTL** — nothing expires a stack whose branch was deleted.

File it or point at the existing issue. Repeated identical sweeps are the
symptom of an unfixed structural leak.

## Red flags

- Killing by age, name pattern, or process count without attribution
- `docker rm` on a container carrying `com.docker.compose.*` labels
- Clearing the compose half and leaving the cluster + registry half up
- Running the `down` level when only `clean` deletes the cluster
- Bundling `docker volume prune` into a process cleanup
- Re-issuing a hung `docker`/`kubectl` call on a starved daemon
- Declaring victory from the 1-minute load average alone
- Reusing a previous sweep's exclusion rule (a path prefix, a PID list)
  instead of re-deriving it — which instance holds the live socket changes
  between sessions, and last time's rule will eventually cut live work
- A "duplicate stack" claim built on a misread elapsed-time field — check
  `etime` units before calling a collision
