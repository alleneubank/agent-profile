# SPEC — pi package support for agent-profile

## Goal

Make the agent-profile repo installable and usable as a pi package: `pi install git:...` (or `pi -e` for development) loads both plugins' skills and provides pi-native equivalents of the plugins' Claude/Codex hooks. No claude/codex manifests or hook scripts are modified — pi reads them; the shell scripts remain the single source of truth for hook policy.

## Context

- Repo layout: `plugins/engineering-practices/` and `plugins/agent-workflows/`, each with `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, and `skills/` (Agent Skills standard). `agent-workflows` additionally ships `hooks/hooks.json` + two scripts.
- Hooks in scope: `SessionStart` (instruction-fingerprint → additionalContext) and `PreToolUse` on `Bash`/`shell` (verifier-bypass guard → deny JSON). `SubagentStart` has no pi analogue (pi has no native subagents) — documented, skipped.
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
- No edits to `.claude-plugin/`, `.codex-plugin/`, `marketplace.json`, `hooks.json`, or `hooks/*.sh`.
- No network calls and no credential access from the extension.
- `package.json` is additive: it must not interfere with existing release-please plugin versioning or `scripts/validate.sh` behavior.

## Non-goals

- Shelled: the adapter/plugin-host extension (revive only on the evidence trigger: bulk third-party plugin imports into pi).
- Not now: recall/silo/canton/infra/linear manifests (later units), subagents, statusline, MCP, a `/plugin` review command, dedup machinery, dotfiles `pi/settings.json` retirement (unit 3).

## Acceptance

1. `npm run check` green (tsc `--noEmit` + `vitest run`), floors exercising real hook scripts.
2. `./scripts/validate.sh` green including the new pi gate.
3. `npm run check` green (tsc `--noEmit` + `vitest run`), floors exercising real hook scripts — cited this session (13/13 + clean tsc).
4. `./scripts/validate.sh` green including the new pi gate.
5. Clean-host E2E evidenced (exe.dev VM, 2026-08-11): skills load, fingerprint hook fires, no extension errors.
6. Claude/Codex parity gate still green after all changes (proof of invariant 3).

## Decisions

Dated entries; provisional statuses ratify only with human confirmation at the PR review gate. D1 ratified in-session by the human.

- D1 2026-08-11 — **Direction: fleet-as-pi-packages, not an adapter.** Why: pi packages ARE pi's plugin system; a claude/codex adapter would duplicate install/enable/dedup/state/trust that `pi install` + `pi config` already own. **ratified (human)**
- D2 2026-08-11 — **Single source of truth for hook policy:** the extension execs the canonical shell scripts (same stdin/JSON contract), never an inline duplicate. Why: the repo's claude↔codex parity gate would otherwise have a third copy to drift. Enforced by the validate.sh pi gate. **provisional**
- D3 2026-08-11 — **Fingerprint delivered as a display custom message** (`pi.sendMessage`, customType `instruction-fingerprint`); `SubagentStart` skipped (no pi analogue — no native subagents). **provisional**
- D4 2026-08-11 — **Hooks fail open:** script errors, timeouts, and parse failures never block a tool call or session start; the guard denies only the shapes the canonical script denies. **provisional**
- D5 2026-08-11 — **Pi package version is independent** of plugin versions (root `package.json` 1.0.0; plugins keep release-please 2.x lines). **provisional**
- D6 2026-08-11 — **Dotfiles `pi/settings.json` skills wiring retires** in favor of the pi package (overlap double-loads the same skills; pi first-wins dedups with warnings). Pending work — migrated to the continuation charter in the recall repo. **provisional**

Campaign status: unit 1 shipped and E2E'd; this repo's LOOP.md dissolved into this SPEC + README + git history (dissolve-docs, 2026-08-11).
