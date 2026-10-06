---
name: tilt
description: Use when working with Tilt or a Tilt-driven dev environment - starting it, Tiltfile errors, resource status, or logs.
---

# Tilt

## First Action: Check for Errors

Before investigating issues or verifying deployments, check resource health. Run **errors first**, separately from pending/in-progress — otherwise real failures get buried in 20+ pending lines:

```bash
# 1. Errors only — surface the buildHistory[0].error so you see WHY, not just THAT
tilt get uiresources -o json | jq -r '.items[] | select(.status.runtimeStatus == "error" or .status.updateStatus == "error") | "\(.metadata.name): runtime=\(.status.runtimeStatus) update=\(.status.updateStatus)\n  reason: \((.status.buildHistory[0].error // "(no buildHistory error; check tilt logs)") | gsub("\n"; " ") | .[0:240])"'

# 2. In-progress and pending — informational; an in-progress build may flip to error any moment
tilt get uiresources -o json | jq -r '.items[] | select(.status.updateStatus == "in_progress" or .status.updateStatus == "pending" or .status.runtimeStatus == "pending") | "\(.metadata.name): runtime=\(.status.runtimeStatus) update=\(.status.updateStatus)"'

# 3. Docker-compose container health — MISSED by the error filter above.
#    An `Up (unhealthy)` compose container keeps runtimeStatus=ok/update=ok, so
#    queries 1-2 never flag it; the red UI badge comes from healthStatus here.
tilt get uiresources -o json | jq -r '.items[] | select(.status.composeResourceInfo.healthStatus == "unhealthy") | "\(.metadata.name): compose healthStatus=unhealthy (HEALTHCHECK failing — service may still be up)"'

# 4. Quick status overview
tilt get uiresources -o json | jq '[.items[].status.updateStatus] | group_by(.) | map({status: .[0], count: length})'
```

If a resource is `in_progress` when you check, **re-poll** before declaring it healthy — it can transition straight to `error` with a populated `buildHistory[0].error`. The `updateStatus` field reflects only the *current* build attempt; the last error always lives in `buildHistory[0].error` even when `updateStatus` is `none` or `not_applicable`.

**Docker-compose resources are a blind spot.** Their `runtimeStatus`/`updateStatus` reflect only build/up state, NOT the container's docker `HEALTHCHECK` — so a probe-failing container (`docker ps` → `Up (unhealthy)`) reads `runtimeStatus=ok` and slips past queries 1-2, while the Tilt UI still reddens it. The authoritative signal is `.status.composeResourceInfo.healthStatus` (`healthy` / `unhealthy` / absent when the service has no healthcheck), which query 3 catches. These resources also have `k8sResourceInfo: null` (`spec.type == "docker-compose"`); to find *why* a probe fails, drop to docker: `docker inspect <compose-project>-<svc> --format '{{json .State.Health}}'` reads the probe's last exit code + output. A common cause is the healthcheck script invoking a CLI the image doesn't ship (e.g. `curl`/`grpcurl` removed in slimmed images) — the service is fine, the probe is broken.

## Non-Default Ports

When Tilt runs on a non-default port, pass the same port to every Tilt API/log
command. If `TILT_PORT` is unset, omit `--port` and use Tilt's default:

```bash
tilt get uiresources --port "$TILT_PORT" -o json
tilt logs "$RESOURCE" --port "$TILT_PORT" --since 5m --tail 200
```

## Resource Status

```bash
# All resources with status
tilt get uiresources -o json | jq '.items[] | {name: .metadata.name, runtime: .status.runtimeStatus, update: .status.updateStatus}'

# Single resource detail
tilt get uiresource/<name> -o json

# Wait for ready
tilt wait --for=condition=Ready uiresource/<name> --timeout=120s
```

**One bounded wait, not a poll loop.** When waiting for a resource to
converge, use a single blocking `tilt wait --for=<condition> --timeout=<t>`
per resource — never a series of `tilt get` status polls. The only re-check
that earns its keep is the `in_progress` re-poll above, which exists to catch
the transition to `error`.

**Status values:**
- RuntimeStatus: `ok`, `error`, `pending`, `none`, `not_applicable`
- UpdateStatus: `ok`, `error`, `pending`, `in_progress`, `none`, `not_applicable`

## Logs

Default to bounded, resource-specific log reads. Tilt already keeps resource
logs available through the UI/API; agents should identify the resource first,
then request the smallest useful slice:

```bash
# Pick the resource from status output, then read only that resource's recent logs.
RESOURCE=<resource>
tilt logs "$RESOURCE" --since 5m --tail 200

# Use JSON Lines only when a script will parse it.
tilt logs "$RESOURCE" --since 5m --json
```

Use full-stream terminal logs only for a short attended repro, not as the durable
Tilt session.

## Trigger and Lifecycle

```bash
tilt trigger <resource>             # Force update
tilt up                             # Start
tilt down                           # Stop and clean up
```

## Tiltfile Args — Never Open the Editor

`tilt args` controls the running Tiltfile's argument list: `config.parse()` values
(e.g. `--with-data-api=true`) and, by default, which resources are enabled.

**Bare `tilt args` opens `$TILT_EDITOR`/`$EDITOR` (or an OS default like VS Code) and
blocks** — the command hangs waiting for the editor to close, stranding the agent.
Always pass args explicitly.

`tilt args` **replaces the entire arg set — it does not append.** Read the current
args first, then set the full new set, following the documented shape — enabled
resources before `--`, `config.parse()` flags (`--flag=value`) after it:

```bash
# 1. Read current args (non-interactive — editor is never opened)
tilt get tiltfiles -o json | jq -r '.items[].spec.args'

# 2. Set the FULL replacement set: resources before `--`, flags after
tilt args playwright:deps -- --with-data-api=true --data-api-path=../canton-data-api

# Clear all args (back to defaults)
tilt args --clear
```

The `--` only stops the CLI from reading `--flags` as `tilt args`'s own flags; a
`config.parse()` Tiltfile parses flags/positionals regardless of order, so re-applying
the tokens you read back round-trips. To toggle a single resource without rewriting
config values, prefer `tilt enable <r>` / `tilt disable <r>` over editing the args list.

Guard: `export TILT_EDITOR=true` so a stray bare `tilt args` exits instead of hanging.

## Starting Tilt

### Assess current state

1. Check whether Tilt is already running in a labeled sox shell:
   ```bash
   ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
   sox ls --json | jq -r --arg root "$ROOT" \
     'select(.kind == "shell" and .status == "live" and .labels.role == "tilt" and .labels.root == $root) | .backing_id'
   ```
   If it is running, check health (First Action above) and skip to monitoring.
2. Prefer the repo's documented dev-stack command over bare `tilt up`: `silo up`,
   `yarn localnet:up`, `make tilt-up`, or the README/package script. These often
   run gen-env or pass the right Tiltfile args.
3. Check required env files (`.localnet.env`, `.env.local`, `silo.toml`): with
   `silo.toml`, use `silo up`; run a gen-env script first when one exists;
   otherwise follow the README bootstrap. Check k3d or Docker prerequisites.

### Start it in a sox shell

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
```

To stop it: `sox kill "$SHELL_ID"`.

### Monitor bootstrap

After about 10s for resource registration, issue one blocking bounded wait per
resource, then run the First Action error and compose-health queries once:

```bash
tilt get uiresources -o json | jq -r '.items[].metadata.name' | \
  xargs -I{} tilt wait --for=condition=Ready 'uiresource/{}' --timeout=300s
```

Bootstrap succeeded when every wait returned Ready and the queries report no
`error`, stuck-`pending`, or `unhealthy` compose resource. `tilt wait` cannot
see compose HEALTHCHECK state, so the sweep is not optional.

### Report

```
## Tilt Status: <healthy|degraded|errored>

**Resources**: X/Y ok
**Shell**: sox $SHELL_ID

### Errors (if any)
- <resource>: <root cause> — <what was fixed or what remains>
```

## Fixing Tiltfile Errors

Fix the source config, not the symptom:

- Fix the Tiltfile, Dockerfile, k8s manifest, or helm values directly.
- No shell workarounds (wrapper scripts, `|| true`, `try/except pass`), no
  fallbacks that mask the failure, no hard-coded ports, paths, hostnames, image
  tags, or container names that should be dynamic.
- Express dependencies declaratively: ordering via `resource_deps()` or
  `k8s_resource(deps=)`, readiness via probe configs, images via `image_deps`,
  env via `silo.toml` or gen-env output. No sleep/retry or readiness polling.
- Port conflicts: fix the allocation source, not a different port.

For each resource in error: read bounded logs, read the Tiltfile and relevant
manifests, fix the root cause, and let Tilt live-reload. For an unhealthy
compose probe, read the cause with `docker inspect` (see First Action) and fix
the probe script rather than disabling the check. After 3 fix iterations on one
resource without progress, report the error with logs and whether it is a
Tiltfile bug, upstream dependency, or infrastructure problem; never silently
skip or disable the resource.

## Tilt live-reloads

Tilt picks up Tiltfile edits, source changes, and Kubernetes manifest updates
without a restart, so restarting is not a fix for any of them. Restart `tilt up`
only for Tilt version upgrades, port/host changes, crashes, or cluster context
switches.

After editing, verify the existing Tilt run picked up the change:

```bash
RESOURCE=<resource>
tilt get uiresource/"$RESOURCE" -o json | jq '.status.updateStatus'
tilt wait --for=condition=Ready uiresource/"$RESOURCE" --timeout=120s
tilt logs "$RESOURCE" --since 2m --tail 100
```

## References

- [TILTFILE_API.md](TILTFILE_API.md) - Tiltfile authoring
- [CLI_REFERENCE.md](CLI_REFERENCE.md) - Complete CLI with JSON patterns
- https://docs.tilt.dev/
