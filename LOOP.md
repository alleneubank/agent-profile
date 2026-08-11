# Loop: pi plugin packages — agent-profile — `main`

Mission: drive the agent-profile repo to **interior-green** for pi compatibility — the repo installs as a pi package (skills + hooks extension) with a verified harness — so the only remaining steps are the human's boundary calls (push agent-profile, publish decisions, dotfiles superproject commit). Work through the ADF loop (SPEC → PLAN → TDD → DEV → E2E). Unblock via the ladder; the verifier — not confidence — decides when work is done.

## State (updated 2026-08-11 — rewrite each iteration; newest facts first)

- Branch `main`, HEAD `dbb5992` (agent-workflows v2.6.0), tree clean at iteration 1 start. Submodule of dotfiles; nothing pushed.
- Direction ratified (human): **fleet-as-pi-packages** — make the plugins themselves pi-compatible instead of building a claude/codex adapter extension. Pi packages are pi's own plugin system; install/update/enable/disable/dedup all owned by pi.
- Scope ratified: agent-profile is the LOOP home; v1 = agent-profile pi package (manifest + hooks extension + floors). recall/silo/canton manifests are later units or follow-up loops; the adapter (plugin-host) design is shelved, not archived — revive only on the evidence trigger (bulk third-party plugin imports into pi).
- Baseline evidence: `./scripts/validate.sh` exit 0 on HEAD `dbb5992` (ran this session, full skill+parity output green). No known pre-existing failures.
- Prior art absorbed: `pi-agent-plugins` (MIT) — failure-boundary and tolerant-parsing patterns; `pi-subagents-j0k3r` — subagent pattern, deferred. Upstream stance: pi core "not planned" for plugin/spec engines (#7776); extensions are the sanctioned path.

## Decisions (append-only; do not re-litigate)

1. 2026-08-11 — **Direction: fleet-as-pi-packages, not an adapter.** Why: pi packages ARE pi's plugin system; a claude/codex adapter would duplicate install/enable/dedup/state/trust that `pi install` + `pi config` already own. **ratified (human)**
2. 2026-08-11 — **Hooks: single source of truth = the existing shell scripts.** The pi extension execs `instruction-fingerprint.sh` / `verifier-bypass-guard.sh` with the same stdin/JSON contract, never duplicating hook policy inline. Why: the repo carries a claude↔codex parity gate (`check_manifest_parity`); a third inline copy of the policy would be the third implementation to drift. **provisional (driver)**
3. 2026-08-11 — **Fingerprint delivery in pi: custom message** (`pi.sendMessage`, customType `instruction-fingerprint`, `display: true`) mirroring claude's `additionalContext` intent (transcript-bucketing for the eval skill). `SubagentStart` fingerprint: skipped — pi has no native subagents and no event analogue. **provisional (driver)**
4. 2026-08-11 — **Hooks fail open.** Script errors, timeouts, and parse failures never block a tool call or session start; the guard denies only the shapes the script itself denies. Mirrors the script's documented fail-open-by-design posture. **provisional (driver)**
5. 2026-08-11 — **Pi package version is independent** of plugin versions (root `package.json` 1.0.0; plugins keep their release-please 2.x lines). **provisional (driver)**
6. 2026-08-11 — **Dotfiles `pi/settings.json` skills wiring stays until unit 3**, then retires in favor of the pi package. Overlap would load the same skills twice; pi's loader first-wins-dedups with warnings. **provisional (driver)**

## Work plan (ADF per unit)

1. **THIS iteration — charter + agent-profile pi package unit.** `package.json` pi manifest (extensions + both plugin skill dirs), `tsconfig.json`, `extensions/pi-hooks.ts` (fingerprint + verifier guard, exec'ing the canonical scripts), vitest floors (unit + structure), additive pi gate in `scripts/validate.sh`. Establishes: repo installable by pi with skills and hooks; verifier green. Defers: README pi docs, dotfiles settings retirement, other fleet repos.
2. **recall repo** — root `package.json` pi manifest (`skills: ["./plugins/recall/skills"]`) + structural test in their pytest style. Defers: none.
3. **dotfiles wiring** — retire the two agent-profile skill entries in `pi/settings.json` (managed floor) once unit 1+2 proven; update `test-pi-config-merge.sh`/SPEC if it asserts those keys. Defers: new-host `pi install` step to unit 4.
4. **Install flow + E2E** — `pi install git:...` for agent-profile + recall on this host; real-pi smoke (attended); README pi sections in both repos.
5. *(if budget)* silo / canton-skills / infra / linear-cli manifests.
6. **Review gate + handoff** — briefed review; write the human's boundary handoff.

## Verification floors

- `npm run check` → `tsc --noEmit` clean + `vitest run` green (extension behavior runs the real scripts; structural test asserts manifest → disk).
- `./scripts/validate.sh` → exit 0 (existing skill + claude↔codex parity gates AND the new pi-manifest gate).
- Real-pi smoke (attended, unit 4): `pi -e extensions/pi-hooks.ts` and `pi install git:...`; assert skills list and no startup errors.
- Review gate — harness first, briefed reviews: the driver and cooks own verification; floors decide. Every review carries its unit's contract — intended outcome, what to judge now, invariants, acceptance evidence, and work explicitly deferred to a later unit; declared deferred work is not a finding. Severity floor: **major** (in the reviewer's own scale); a below-floor-only reject does not block; max 3 review→fixup rounds per reviewed unit. A finding the harness should have caught earns a new floor, not just a patch.

## Unblocking ladder

Investigate (two focused passes) → doctrine (`doctrine.md` in the loop-brief skill; this file's Decisions; agent-profile AGENTS.md) → `rl consult` with evidence + candidate approaches + spec excerpts → provisional decision (dated entry above) → accumulate for the human (irreversible / scope-changing / Boundary items only).

## In-session edit policy

The driver edits directly when the fix is finding-sized (≤ ~2 files, mechanical, fully understood). After any in-session edit: run the owning gates and commit conventionally — the edit lands in its unit's review scope; the driver never self-approves. Larger or design-shaped work goes to a cook packet. Never mix in-session edits with an in-flight worker on the same files.

## Boundaries — NEVER

- Never push, open PRs, or merge. Pushes here move the claude/codex marketplace surface (agent-profile is installed from GitHub by both harnesses) — publish is the human's, per-artifact, same for recall.
- Never touch live secrets or biometrics; never reroute around auth failures — surface and stop.
- **Never edit the claude/codex manifests, `marketplace.json`, `hooks.json`, or the hook scripts** — pi reads them; the scripts are the single source of truth the parity gate depends on.
- Never commit in the dotfiles superproject (the submodule-pointer advance is part of the publish flow).
- Never edit pi's own `settings.json` outside unit 3's scope.

## Known pre-existing failures — do not chase (cited evidence only)

- None. `./scripts/validate.sh` exit 0 on HEAD `dbb5992` (this session).

## Terminal states & budget

- **done:** units 1–4 floors green (npm run check, validate.sh, real-pi smoke), review pass, LOOP State updated, handoff written for the human's boundary steps. Then stop; dissolution rides the ship (dissolve-docs).
- **blocked:** numbered decision batch, each with evidence + a proposed answer; keep working independent items until only the batch remains.
- **budget:** hard cap **8 iterations** (numeric, set at authoring; raising it is the human's) — or, earlier, three consecutive iterations without measurable movement on any checklist item → stop honestly with what was tried and why it cannot converge.
