---
name: tiltup
description: Use when starting tilt, debugging Tiltfile errors, or bootstrapping a dev environment. Starts Tilt in a detached sox shell, monitors bootstrap to healthy state, fixes Tiltfile bugs without hard-coding or fallbacks.
---

# Tilt Up

## Principles (Always Active)

These apply whenever working with Tiltfiles, Tilt errors, or dev environment bootstrap:

### Fix the Tiltfile, Not the Symptoms

- **Fix the source config directly** - Tiltfile, Dockerfile, k8s manifest, or helm values
- **Never add shell workarounds** - no wrapper scripts, no `|| true`, no `try/except pass`
- **Never hard-code** ports, paths, hostnames, image tags, or container names that should be dynamic
- **Never add fallbacks** that mask the real error - if a resource fails, the failure must be visible
- **Never add sleep/retry loops** for flaky dependencies - fix dependency ordering via `resource_deps()` or `k8s_resource(deps=)`
- **Never add polling** for readiness that Tilt already handles - use `k8s_resource(readiness_probe=)` or probe configs

### Express Dependencies Declaratively

- Port conflicts: fix the port allocation source, don't pick a different port
- Resource ordering: use `resource_deps()`, not sequential startup scripts
- Env vars: use `silo.toml` or gen-env output, not inline defaults
- Image availability: use `image_deps` or `deps`, not sleep-until-ready

### Tilt Live-Reloads

After editing a Tiltfile, Tilt picks up changes automatically. **Never restart `tilt up`** for:
- Tiltfile edits
- Source code changes
- Kubernetes manifest updates

Restart only for: Tilt version upgrades, port/host config changes, crashes, cluster context switches.

## Workflow (When Explicitly Starting Tilt)

### Step 1: Assess Current State

1. Check if tilt is already running:
   ```bash
   ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
   sox ls --json | jq -r --arg root "$ROOT" \
     'select(.kind == "shell" and .status == "live" and .labels.role == "tilt" and .labels.root == $root) | .backing_id'
   ```
   If running, check health via `tilt get uiresources -o json` and skip to Step 3.

2. Pick the repo's documented dev-stack command before defaulting to bare
   `tilt up`. Prefer `silo up`, `yarn localnet:up`, `make tilt-up`, or the
   README/package script when one exists; these often run gen-env or pass the
   right Tiltfile args.

3. Check for required env files (`.localnet.env`, `.env.local`, `silo.toml`):
   - If `silo.toml` exists, use `silo up` path
   - If gen-env script exists, run it first
   - If neither, check project README for bootstrap instructions

4. Check for k3d cluster or Docker prerequisites.

### Step 2: Start Tilt in a sox shell

Start Tilt in a detached sox shell, which outlives the agent's turn and the
human can attach to. That shell owns the Tilt UI/API; diagnose from the agent
turn with `tilt get ...` and bounded `tilt logs "$RESOURCE" ...` commands.
Never `sox attach` from an agent turn: it blocks.

`--exec` takes argv with no shell, so hold the boot command in an **array**:
zsh does not word-split unquoted expansions, so a `START_CMD='tilt up'` string
arrives as one argument there even though it works in bash. sox keeps no
readable scrollback, so the boot command writes to a log file. Run `sox daemon
--ensure` first if `sox ls` cannot reach this machine's daemon.

```bash
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
START_CMD=(tilt up)
# Replace START_CMD with the repo's documented boot command when present, e.g.:
# START_CMD=(yarn localnet:up)
# START_CMD=(silo up)
LOG="${TMPDIR:-/tmp}/tilt-$(basename "$ROOT").log"

SHELL_ID="$(sox ls --json | jq -r --arg root "$ROOT" \
  'select(.kind == "shell" and .status == "live" and .labels.role == "tilt" and .labels.root == $root) | .backing_id')"
if [ -n "$SHELL_ID" ]; then
  echo "Tilt shell already exists: $SHELL_ID"
else
  # sh receives the log path as $0 and the boot command as "$@".
  SHELL_ID="$(sox up "localhost:$ROOT" --detach --no-chrome --no-ext \
    --exec -- sh -c 'exec "$@" >"$0" 2>&1' "$LOG" "${START_CMD[@]}" | tail -1)"
  sox label "$SHELL_ID" role=tilt root="$ROOT" >/dev/null
  # A boot command that dies at once has exited within 5s; exit 3 means it is
  # still running, which is the healthy case.
  sox wait "$SHELL_ID" --timeout 5
  if [ $? -ne 3 ]; then
    echo "Boot command exited immediately:"
    tail -20 "$LOG"
  else
    echo "Started tilt in sox shell: $SHELL_ID (log: $LOG)"
  fi
fi

tilt get uiresources -o json | jq -r '.items[] | "\(.metadata.name): runtime=\(.status.runtimeStatus) update=\(.status.updateStatus)"'
```

To stop it: `sox kill "$SHELL_ID"`.

For silo projects: `silo up` instead of `tilt up`.

### Step 3: Monitor Bootstrap

Block on convergence — one bounded wait, not a foreground poll loop:
1. Wait 10s for initial resource registration
2. Issue one blocking bounded wait per resource:
   ```bash
   tilt get uiresources -o json | jq -r '.items[].metadata.name' | \
     xargs -I{} tilt wait --for=condition=Ready 'uiresource/{}' --timeout=300s
   ```
3. `tilt wait` does not see docker-compose HEALTHCHECK state — an
   `Up (unhealthy)` compose container keeps `runtimeStatus=ok` and is otherwise
   invisible, so bootstrap can look "done" while canton/splice/postgres are
   silently failing their HEALTHCHECK. Follow the wait with ONE health sweep:
   ```bash
   tilt get uiresources -o json | jq -r '.items[] | select(.status.runtimeStatus == "error" or .status.updateStatus == "error" or .status.updateStatus == "pending" or .status.composeResourceInfo.healthStatus == "unhealthy") | "\(.metadata.name): runtime=\(.status.runtimeStatus) update=\(.status.updateStatus) compose=\(.status.composeResourceInfo.healthStatus // "-")"'
   ```
4. Success: every wait returned Ready AND the sweep reports no `error`,
   stuck-`pending`, or `unhealthy` compose resource
5. If a wait times out, a resource stabilizes in `error`, OR a compose resource
   stays `unhealthy`, proceed to Step 4. For an unhealthy compose probe, read
   the real cause with
   `docker inspect <compose-project>-<svc> --format '{{json .State.Health}}'` —
   often the mounted healthcheck script calls a CLI the image lacks (the service
   is up; fix the probe script, don't disable the check)

### Step 4: Diagnose and Fix Errors

For each resource in error state:
1. Read bounded logs: `RESOURCE=<resource>; tilt logs "$RESOURCE" --since 5m --tail 200`
2. Read the Tiltfile and relevant k8s manifests
3. Identify root cause in the config (not the running process)
4. Apply fix following the Principles above
5. Tilt live-reloads - re-poll status to verify

After 3 fix iterations on the same resource without progress:
- Report the error with full logs
- Identify whether it's a Tiltfile bug, upstream dependency, or infrastructure problem
- Do not silently skip or disable the resource

### Step 5: Report

```
## Tilt Status: <healthy|degraded|errored>

**Resources**: X/Y ok
**Shell**: sox $SHELL_ID

### Errors (if any)
- <resource>: <root cause> — <what was fixed or what remains>
```
