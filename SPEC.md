# SPEC — pi package support for agent-profile

`missionctl` is a separately versioned PATH dependency. This repository owns
the shared doctrine, not the reducer, executable, or lifecycle adapter.

## Goal

Make the agent-profile repo installable and usable as a pi package: `pi install git:...` (or `pi -e` for development) loads both plugins' skills and provides pi-native equivalents of the plugins' Claude/Codex hooks. No claude/codex manifests or hook scripts are modified — pi reads them; the shell scripts remain the single source of truth for hook policy.

## Context

- Repo layout: `plugins/engineering-practices/` and `plugins/agent-workflows/`, each with `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, and `skills/` (Agent Skills standard). `agent-workflows` additionally ships `hooks/hooks.json` + two scripts.
- Pi adapter hooks in scope: `SessionStart` (instruction-fingerprint → additionalContext) and `PreToolUse` on `Bash`/`shell` (verifier-bypass guard → deny JSON). `SubagentStart` has no pi analogue. The separately installed missionctl plugin owns its own `SessionStart` loop-context hook.
- pi's hook model: in-process extension events (`session_start`, `tool_call`, ...). There is no hooks.json consumer in pi core; the extension is the consumer.
- pi's skill loader already accepts Claude Code skill frontmatter (upstream #7468), so skills port untouched.

## Requirements

- REQ-PI-001 — **Manifest**: repo root `package.json` carries a `pi` key: `extensions: ["./extensions/pi-hooks.ts"]`, `skills: ["./plugins/engineering-practices/skills", "./plugins/agent-workflows/skills"]`, keyword `pi-package`. Every referenced path must resolve on disk (gate + test).
- REQ-PI-002 — **Fingerprint**: extension registers `session_start`; on each session it execs `instruction-fingerprint.sh SessionStart` and, on a `hookSpecificOutput.additionalContext` response, emits a custom message (`customType: "instruction-fingerprint"`, `display: true`) so transcripts stay bucketable by instruction version. Any failure degrades to silence — the event handler never throws into pi startup.
- REQ-PI-003 — **Verifier guard**: extension registers `tool_call`; for `bash` calls it execs `verifier-bypass-guard.sh` with stdin `{"tool_input":{"command": ...}}` (the script's own contract). A `permissionDecision: "deny"` response blocks the call (`{ block: true, reason }` with the script's reason). All other outcomes pass through; non-bash tools untouched.
- REQ-PI-004 — **Boundedness**: every hook subprocess runs with a timeout (fingerprint 10s, guard 5s — matching `hooks.json`), stdout is capped, spawn/exec errors are handled; hooks fail open (an error or timeout never blocks).
- REQ-PI-005 — **Parity**: the extension contains no inline copy of hook policy — it execs the canonical scripts. `scripts/validate.sh` gains an additive pi gate asserting manifest paths resolve and the extension still references both scripts (a third implementation would drift).
- REQ-PI-006 — **Testability**: vitest floors execute the real scripts; floors are deterministic, use no network, no LLM, and no pi binary (host-independent).
- REQ-PI-007 — **Docs + E2E (delivered)**: README pi section (install / develop / verify) shipped; clean-host E2E evidenced 2026-08-11 via a throwaway exe.dev VM — `pi install https://github.com/alleneubank/agent-profile@feat/pi-package-support` on node 22 + pi 0.84.1, 41 package skills in `get_commands`, `instruction-fingerprint` custom message in `get_entries`, no `extension_error` events. Default-branch install activates once the feature branch merges (remote `main` predated unit 1).

## Invariants

- The extension never throws into pi startup or the agent loop; every handler path is caught.
- Hooks fail open; the guard blocks only the shapes the canonical script denies.
- The Pi adapter does not duplicate or reinterpret `.claude-plugin/`, `.codex-plugin/`, marketplace, or hook policy. Additive shared lifecycle hooks remain documented Pi skips when no analogue exists.
- No network calls and no credential access from the extension.
- `package.json` is additive: it must not interfere with existing release-please plugin versioning or `scripts/validate.sh` behavior.

## Non-goals

- Shelled: the adapter/plugin-host extension (revive only on the evidence trigger: bulk third-party plugin imports into pi).
- Not now: recall/silo/canton/infra/linear manifests (later units), subagents, statusline, MCP, a `/plugin` review command, dedup machinery, dotfiles `pi/settings.json` retirement (unit 3).

## Acceptance

1. `npm run check` green (tsc `--noEmit` + `vitest run`), floors exercising real hook scripts.
2. `./scripts/validate.sh` green including the new pi gate.
3. Clean-host E2E: skills load, the fingerprint hook fires, no `extension_error` events (evidence in REQ-PI-007).
4. Claude/Codex parity gate still green after all changes (proof of invariant 3).

## Decisions

Dated entries; provisional statuses ratify only with human confirmation at the PR review gate. D1 ratified in-session by the human.

- D1 2026-08-11 — **Direction: fleet-as-pi-packages, not an adapter.** Why: pi packages ARE pi's plugin system; a claude/codex adapter would duplicate install/enable/dedup/state/trust that `pi install` + `pi config` already own. **ratified (human)**
- D2 2026-08-11 — **Single source of truth for hook policy:** the extension execs the canonical shell scripts (same stdin/JSON contract), never an inline duplicate. Why: the repo's claude↔codex parity gate would otherwise have a third copy to drift. Enforced by the validate.sh pi gate. **provisional**
- D3 2026-08-11 — **Fingerprint delivered as a display custom message** (`pi.sendMessage`, customType `instruction-fingerprint`); `SubagentStart` skipped (no pi analogue — no native subagents). **provisional**
- D4 2026-08-11 — **Hooks fail open:** script errors, timeouts, and parse failures never block a tool call or session start; the guard denies only the shapes the canonical script denies. **provisional**
- D5 2026-08-11 — **Pi package version is independent** of plugin versions (root `package.json` 1.0.0; plugins keep release-please 2.x lines). **provisional**
- D6 2026-08-11 — **Dotfiles `pi/settings.json` skills wiring retires** in favor of the pi package (overlap double-loads the same skills; pi first-wins dedups with warnings). Pending work — migrated to the continuation charter in the recall repo. **provisional**
- D7 2026-08-28 — **Missionctl owns its lifecycle adapter.** Its hooks-only plugin registers a single `SessionStart` hook that injects the bounded loop context; compaction is an agent-driven `missionctl compact` transition, not a hook. Pi still receives the portable mission-command skill. **ratified (human)** (hook set narrowed 2026-08-29 with the LOOP-first missionctl redesign — provisional (driver))
- D8 2026-08-28 — **Agent-profile does not vendor or register missionctl.** Dotfiles installs the independently versioned executable through mise and the lifecycle adapter through missionctl's marketplace. **ratified (human)**

Campaign status: unit 1 shipped and E2E'd; this repo's LOOP.md dissolved into this SPEC + README + git history (dissolve-docs, 2026-08-11).
- 2026-08-29 — SPEC.md D7 is amended in place to the single SessionStart hook instead of adding a superseding decision, because the compaction hooks never shipped. **provisional (driver)**
- 2026-08-29 — The stack diagram lists MISSION last as optional rather than removing it, so cross-campaign outcomes keep a named home. **provisional (driver)**
