# SPEC — agent-profile runtime and maintenance contracts

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

## Cross-harness skill usage census

### Requirements

- REQ-CENSUS-001 — **Recall ownership**: `scripts/skill-usage.sh` MUST obtain
  usage from `recall stats skills --json`; it MUST NOT parse transcripts or
  accept `--root`. Missing Recall, a failed Recall command, malformed output,
  or incomplete coverage MUST exit nonzero before emitting `never_fired`.
- REQ-CENSUS-002 — **Options**: the wrapper preserves `--since`, `--plugin`,
  and `--json`; adds repeatable `--source`, `--local`, and `--fleet-config`;
  and forwards every Recall-owned option without forwarding `--plugin`.
- REQ-CENSUS-003 — **Catalog**: declared skills are discovered from the current
  `plugins/*/skills/*/SKILL.md` catalog and represented as
  `<plugin>:<skill>`. `--plugin` limits only the declared report population.
- REQ-CENSUS-004 — **Canonicalization**: an exact declared
  `<plugin>:<skill>` name is accepted. A bare name maps only when exactly one
  skill in the complete catalog has that suffix. Any ambiguous bare name MUST
  fail before computing `never_fired`; unrelated names remain unmatched
  diagnostics and MUST NOT count as catalog coverage.
- REQ-CENSUS-005 — **Coverage**: local mode requires one complete local
  endpoint; default mode requires complete local-plus-fleet coverage. Expected
  and successful hosts MUST match, covered sources MUST equal the request (all
  five by default), population counters MUST be internally consistent, and the
  all-time control MUST contain both sessions and attributed invocations. Every
  invocation row MUST contain at least one distinct session and MUST fit inside
  the considered-session population. If multiple reported names canonicalize
  to one skill within the same source and host, invocation counts MUST aggregate
  exactly. The wrapper MUST emit an exact distinct-session count only when the
  union bounds collapse; otherwise it MUST emit explicit minimum/maximum bounds
  and MUST NOT claim an exact count.
- REQ-CENSUS-006 — **Report**: JSON preserves `window`, `control_total`,
  `fired`, and `never_fired`; replaces transcript metadata with Recall's
  structured `coverage`; and adds aggregated `unmatched` diagnostics. Fired
  rows aggregate invocation counts across Recall's source/host rows. `sessions`
  is an integer when the distinct-session union is provable; otherwise it is
  `null` and `session_bounds` carries inclusive `minimum` and `maximum` values.
- REQ-CENSUS-007 — **Decision boundary**: this census declares no skill dead
  and performs no archival, rename, catalog, or plugin-version mutation.
  `agent-workflows:afk` remains public and `agent-workflows:writing-plans`
  remains only a candidate pending complete-fleet evidence.
- REQ-CENSUS-008 — **Verification**: tests use a fake Recall executable and
  cover exact/bare canonicalization, ambiguity, unmatched names, filters and
  option forwarding, missing/failed Recall, malformed or incomplete coverage,
  and empty control. `npm run check` and `./scripts/validate.sh` are release
  gates.

### Invariants

- No incomplete or ambiguous result can produce a `never_fired` list.
- Recall remains the only owner of transcript formats and harness attribution.
- Unmatched Recall names are visible without reducing the declared catalog's
  never-fired population.

### Acceptance

1. Fake-Recall wrapper tests prove REQ-CENSUS-001..006 and fail closed on every
   incomplete-coverage class.
2. `npm run check` and `./scripts/validate.sh` pass without changing either
   plugin's `3.0.0` version.
3. A real all-time and recent-window query succeeds only after every configured
   host and all five sources report complete coverage.

## Decisions

Dated entries; provisional statuses ratify only with human confirmation at the publish boundary. D1 ratified in-session by the human.

- D1 2026-08-11 — **Direction: fleet-as-pi-packages, not an adapter.** Why: pi packages ARE pi's plugin system; a claude/codex adapter would duplicate install/enable/dedup/state/trust that `pi install` + `pi config` already own. **ratified (human)**
- D2 2026-08-11 — **Single source of truth for hook policy:** the extension execs the canonical shell scripts (same stdin/JSON contract), never an inline duplicate. Why: the repo's claude↔codex parity gate would otherwise have a third copy to drift. Enforced by the validate.sh pi gate. **provisional**
- D3 2026-08-11 — **Fingerprint delivered as a display custom message** (`pi.sendMessage`, customType `instruction-fingerprint`); `SubagentStart` skipped (no pi analogue — no native subagents). **provisional**
- D4 2026-08-11 — **Hooks fail open:** script errors, timeouts, and parse failures never block a tool call or session start; the guard denies only the shapes the canonical script denies. **provisional**
- D5 2026-08-11 — **Pi package version is independent** of plugin versions (root `package.json` 1.0.0; plugins keep release-please 2.x lines). **provisional**
- D6 2026-08-11 — **Dotfiles `pi/settings.json` skills wiring retires** in favor of the pi package (overlap double-loads the same skills; pi first-wins dedups with warnings). Pending work — migrated to the continuation charter in the recall repo. **provisional**
- D7 2026-08-28 — **Missionctl owns its lifecycle adapter.** Its hooks-only plugin registers a single `SessionStart` hook that injects the bounded loop context; compaction is an agent-driven `missionctl compact` transition, not a hook. Pi still receives the portable mission-command skill. **ratified (human)** (hook set narrowed 2026-08-29 with the LOOP-first missionctl redesign — provisional (driver))
- D8 2026-08-28 — **Agent-profile does not vendor or register missionctl.** Dotfiles installs the independently versioned executable through mise and the lifecycle adapter through missionctl's marketplace. **ratified (human)**
- D9 2026-08-30 — **Skill usage is Recall-owned and fail-closed across the complete fleet.** The wrapper owns only current-catalog canonicalization and presentation; no skill is archived in this campaign. `afk` remains public and `writing-plans` remains a candidate only. **ratified (human)**

Campaign status: unit 1 shipped and E2E'd; this repo's LOOP.md dissolved into this SPEC + README + git history (dissolve-docs, 2026-08-11).
- 2026-08-29 — SPEC.md D7 is amended in place to the single SessionStart hook instead of adding a superseding decision, because the compaction hooks never shipped. **provisional (driver)**
- 2026-08-29 — The stack diagram lists MISSION last as optional rather than removing it, so cross-campaign outcomes keep a named home. **provisional (driver)**
- 2026-08-30 — Keep afk public and make no archival or renaming changes in this campaign. **ratified (human)**
- 2026-08-30 — When exact and bare aliases overlap within one host/source, preserve exact invocation totals and report honest distinct-session union bounds unless the population proves an exact union. **provisional (driver)**

## Behavior-first verification profile

### Requirements

- REQ-BUGBASH-001 — **Evidence selection:** `AGENTS.md` starts verification
  from material user/operator risks and chooses the cheapest faithful evidence.
  Generic generative code review is not a default delivery gate. Specialized
  review is bounded to a named risk and severity floor; ADF high-risk classes
  receive the matching review by default unless the human records a PLAN waiver.
- REQ-BUGBASH-002 — **Real-use gate:** an operable application or system uses a
  task-based bug bash when lower-level checks cannot expose its assembled
  behavior. The charter names the exact artifact and environment, roles, tasks,
  expected outcomes, evidence, severity floor, budget, and boundaries.
- REQ-BUGBASH-003 — **Independent terminal:** author-run dogfood is discovery;
  an experiential terminal uses a fresh, disinterested participant when the
  path is automatable. A required device, biometric, live secret, or subjective
  human response remains a Boundary item.
- REQ-BUGBASH-004 — **Findings and boundedness:** findings are observable and
  reproducible through the public surface. A run terminates `green`, `findings`,
  `blocked`, or `budget-exhausted`; skipped tasks and unavailable environments
  cannot silently pass, and no loop runs "until approval."
- REQ-BUGBASH-005 — **Workflow coherence:** loop, brief, E2E, eval, planning,
  and plugin guidance route assembled-behavior verification to `bugbash` while
  retaining objective harnesses and explicitly selected specialist review.
- REQ-BUGBASH-006 — **Wiki deltas:** test planning maps risks and public
  contracts to evidence rather than tests per function; retry outcome does not
  classify flakes; legitimate production test seams remain allowed; applicable
  code properties are scoped to their failure modes; post-green refactoring and
  independently green prefactoring are represented in delivery guidance.
- REQ-BUGBASH-007 — **Codex self-hosting instructions:** when Codex project
  override semantics apply, working in this repository does not load the
  canonical global `AGENTS.md` body twice. The override points contributors
  without the installed profile back to the canonical file; it makes no
  fleet-wide deduplication claim for other harnesses.
- REQ-BUGBASH-008 — **Verification:** the skill catalog validates, fixed
  engineering and gate-routing scenarios have no material-or-higher gap in a
  fresh-context run, and `npm run check` plus `./scripts/validate.sh` pass.

### Invariants

- Dogfooding does not replace deterministic correctness, security, migration,
  or public-contract checks that a more faithful verifier already covers.
- Static review requested by the user or selected for a named non-executable
  risk remains supported; only the unconditional generic review loop is removed.
- No release version, tag, push, PR, merge, or marketplace publication occurs
  in this change.

### Decisions

- Replace the profile's default reviewer/fix-up terminal with a bounded bug bash
  focused on the application or system under test. (2026-09-03, ratified by the
  user's request; corroborated by Recall sessions
  `9987bea729a9d8bf310d2abbf35ba3ce` and
  `c92d7097a72be8b1e994391537ce94d3`)
- Preserve author dogfood as discovery while requiring fresh execution only for
  an independent experiential terminal. (2026-09-03, provisional)
- Preserve targeted specialist review for named trust-boundary risks: Recall
  session `7e2b9709083b760ab88e143f9530d1d8` found a real packet-boundary
  validation defect. (2026-09-03, provisional)
- Keep the existing August engineering-practices distillate and amend only the
  wiki gaps that change decisions; the runtime profile does not copy or depend
  on the wiki. (2026-09-03, provisional)
- Defer plugin version bumps and all publication to a separately authorized
  release action. (2026-09-03, provisional)

### Acceptance

1. `plugins/agent-workflows/skills/bugbash/SKILL.md` validates and produces a
   task charter plus behavior-evidence findings rather than a static diff review.
2. No always-loaded instruction requires generic reviewer approval to finish an
   ordinary operable-surface change.
3. Engineering-practice scenarios cover risk-driven QA, causal flake diagnosis,
   legitimate test seams, property applicability, and prefactoring.
4. Gate-routing scenarios distinguish harness-only, bug-bash, specialist-review,
   and human-boundary work, including exhausted task budgets.
5. `npm run check` and `./scripts/validate.sh` pass after the final mutation.
