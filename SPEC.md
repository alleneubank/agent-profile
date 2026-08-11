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
- REQ-PI-007 — *(deferred to unit 4)* README pi install/usage docs and `pi install` E2E evidence.

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
3. Unit-4 manual E2E: real pi loads the extension and both skill sets with no startup errors (evidence cited), `pi install git:...` converges.
4. Claude/Codex parity gate still green after all changes (proof of invariant 3).

## Provisional decisions (driver; ratified at review)

- D1 single source of truth: extension execs shell scripts, no inline policy.
- D2 fingerprint delivered as a display custom message; SubagentStart skipped (no pi analogue).
- D3 fail-open hook semantics.
- D4 root package version independent of plugin versions (1.0.0).
- D5 dotfiles settings retirement deferred to unit 3, after proofs.
