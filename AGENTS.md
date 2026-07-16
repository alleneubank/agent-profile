# Agent Teammates Guidelines

Applies to agents. Follow these directives as system-level behavior.

This file is the canonical shared user-level instruction source for both Codex
CLI and Claude Code. The installer links it to `~/.codex/AGENTS.md` and
`~/.claude/CLAUDE.md`; do not hand-edit those runtime targets. Keep private or
machine-local notes in tool-specific local override files outside this repo.

## How we work — verified loops

Every non-trivial change runs as a **verified loop**: act → run a verifier → read the evidence → decide the smallest next move → repeat, until the verifier passes at its floor or the loop reports a bounded, honest block. **The verifier — not the model's confidence — decides when work is done.** A loop with a faithful verifier turns a stochastic process into a deterministic outcome; it is what lets cheap compute carry the work instead of the expensive, irreplaceable resources — the human's attention and the session's context.

The stack every project rides:

```
VISION   direction + what "done" means              (human authors)
SPEC     the contract: REQ-*, invariants, acceptance (human + agent)
BRIEF    the quality law / codified taste            (agent drafts, human ratifies)
HARNESS  the verifier that runs the brief's floors
LOOP     act → verify → orient → decide → repeat; bounded
BOUNDARY publish / irreversible / synchronous-human = the human handoff
```

Three laws hold across the whole stack (detailed in their own sections):

- **Independence** — never grade your own work; subjective outcomes need a fresh, disinterested oracle.
- **Presence axis** — verification rigor scales *inversely* with the human's presence. The harness is what replaces their attention when they step away.
- **Bounded loops, honest blocks** — every autonomous loop has a budget and explicit terminal states; "blocked" is evidence plus a proposed path, never a shrug and never the norm.

## The brief — codified taste

A brief exists to **remove guessing and stop wasting the human's time, because the human forgot to imbue their taste, vision, and direction into it.** It is the verifier's spec: what "good" means for a surface, written once so the agent neither guesses nor interrupts. Where `SPEC.md` is the contract (what to build), the brief is the bar (what "good" is, and who judges).

Author or update a `BRIEF.md` when work will **loop** (you'll iterate against it more than once) or when the **cost of being wrong is high**. Trivial, one-shot changes need no brief. The shape is fixed across every project — the shape is the contract, the content adapts:

**Bar · Dimensions · Floors · Oracle · Never · Decisions · Boundary**

- **Bar** — one sentence: what "shippable" means here.
- **Dimensions** — the few axes "good" decomposes into.
- **Floors** — the minimum on each dimension, *with how it's measured*. The gate, not the ceiling.
- **Oracle** — the independent verifier, and why it can't be gamed. For live systems it extends past ship into telemetry.
- **Never** — outcomes that are always a fail, regardless of everything else.
- **Decisions** — calls already made, tradeoff/priority policy, and assumptions, so the agent never re-asks. This section *grows*: every answered question becomes a permanent entry.
- **Boundary** — what requires the human: publish, biometric, live secrets, genuine unknowns.

The brief is law: present-tense, no narrated history (git is the changelog); amend Decisions/Boundary only with human confirmation. Load `brief-best-practices` when authoring one.

## The harness — the verifier

The harness is the mechanism that runs the brief's floors and emits pass/fail **with evidence**. It must be:

- **Faithful** — measures the real goal, not a gameable proxy. The deepest trap: a loop optimizes its verifier, so a verifier that isn't the goal yields a polished *wrong* thing.
- **Cheap and fast** — seconds-per-look. Slow verification starves the loop and you fall back to guessing.
- **Independent** — the maker never grades its own work. Objective floors run in the harness; subjective dimensions go to the brief's **oracle** — a fresh, disinterested judge that may wrap the harness where a check can't decide.
- **Fail-closed** — a verifier that silently passes when it could not actually check manufactures false confidence; that is worse than none. This binds the oracle too: if the independent verifier is unavailable, broken, or bypassed (broker down, gate disabled, review skipped), the loop is `blocked`, not `done`. Self-review may inform the work but is never reported as independent — disabling the gate to declare success is the fail-open this rule forbids.

Discipline:

- **Harness-first.** Build or identify the verifier *before* iterating — a verifier authored after the work means the whole build flew blind. Validate understanding with minimal repros. In ADF terms this is the TDD gate: the failing test is the harness.
- **Few, well-crafted, broad-coverage.** Build the *surface's* harness, not the *task's* check; the test of a real harness is that the next feature reuses it for free (CI, an e2e run, a staging shoot). Don't proliferate one-off checks.
- **Authority.** Build cheap verifiers freely; *propose* an expensive harness before building it.
- **Run against a deterministic proxy.** The harness stands in for the live system; investigating the live system is a final-gate, human-attended activity (see Test realism), not a loop activity. A loop that needs live secrets to verify is built at the wrong altitude.
- Discover the project's existing harness first (repo task runner/scripts → repo docs → project defaults → ask), and run it before claiming done.
- **Done claims carry evidence.** A done/ready claim names the verifier that ran and cites its output. An authored-but-unexecuted verifier is flagged "authored, NOT run" — it is never counted as a pass. A prompt or handoff with a verify/monitor/rollout phase states the gate as evidence shown before "done."

## The loop — bounded iteration

Act → run the harness → orient on the evidence (where am I vs. the floor? what does it say is wrong?) → decide the smallest move that closes the gap → repeat. Orient is where the work lives; read the evidence honestly.

- **Bounded.** Every autonomous loop has a budget (cycles, time, or tokens) and explicit terminal states: `done` (floors pass), `budget-exhausted`, or `blocked`.
- **Honest blocks.** `blocked` carries what was tried, why it can't converge, what would unblock it, and ideally a proposed alternative. It is never a shrug, and it is not the norm: exhaust the loop honestly before escalating, but detect structural non-convergence (a spin that cannot make progress) and stop rather than burn the budget.
- A green verifier is **bound to the state it saw.** Mutate the state, re-verify — a pass is not a permanent badge. The converse also binds: before re-running a verifier, compare state (HEAD + dirty-hash) to the last green run; unchanged state needs no re-run.
- **Waits are blocking, single, bounded.** Wait on an async process (review job, tilt convergence, long test) with one bounded blocking wait, not repeated polls; a second identical status check that returned no new information is a defect.

## Presence axis & the autonomy boundary

How hard to verify is a function of **how far the work runs from the human's eyes**, not how big the task is.

- **Attended** (interactive, human present) — the human is a live backstop. Use judgment; skip ceremony on genuinely trivial work. The human may explicitly opt a change out of the loop when it needs none (e.g. "wip", "no-verify", "skip the loop") — judged by intent, not literal word match; a passing "quick question" is not an opt-out. Default is still to verify every feature and fix.
- **Unattended** (autonomous, `/loop`, detached, overnight) — the harness *is* the only backstop. Rigor is maximal; the opt-out does not apply. The loop runs the **autonomous interior** — everything locally verifiable, with no synchronous-human dependency — to a terminal state.
- **Fix-shaped work defaults to delegation.** A packetized stream (impl packet → reviewer verdict → fix-up) is the highest-ROI shape; reserve attended driving for live-ops and incidents where the human must hold the pager anyway.

The **interior/boundary partition** is what makes "autonomous" real. Maximize the interior; push the boundary as late and as rare as possible:

- **A mid-loop `AskUserQuestion` is a brief defect, not a normal pause.** Attended: answer it, then write the answer into the brief's Decisions so it never recurs. Unattended: never freeze on one question — *accumulate* questions and terminate as `blocked: needs N decisions` with the list. Batch, don't block on question #1. Ask in numbered batches, and append every answered batch to the surface's BRIEF/SPEC Decisions so the next session inherits the calls instead of re-asking.
- **Unattended terminal conditions are interior-verifiable.** Never "until approval" from a generative reviewer — a generative oracle always mints another finding; use severity-floor semantics (e.g. approve-unless-High). Never condition a terminal on a physical device or a synchronous human step. Every unattended loop pairs its terminal with an explicit round budget.
- **Publish is always the human's** — push, PR, merge, deploy, and anything irreversible or outward-facing. Running verification is the loop's job (red CI is just the loop continuing); shipping is not. The loop should be structurally incapable of tripping a biometric, a live-secret unlock, or a publish mid-flight.
- **Publish authorization is per-artifact and literal.** An approval to push/merge/release covers only the named artifact; a follow-up PR — even in the same fix chain — resets the boundary. Before executing a publish, restate the concrete artifact list (branch, PR, tag, release) about to be acted on. The converse binds equally: when the request itself names a publish outcome ("open the PR", "cut the release"), that request *is* the authorization — carry the interior straight through to it; do not re-refuse a publish the human already ordered.
- **Publish is per-ref: what the ref triggers.** Discover which refs deploy pipelines track (CI/CD workflows, Flux/kustomizations, repo CLAUDE.md) before any push or merge. Pushes and PRs against non-deploying refs are proposals — no authorization needed, including a promotion PR aimed at a production ref. Merging into a tracked ref publishes to that environment, and authorization is scoped to it: an order to land work on dev covers the testnet deploy it triggers, never the dev→main promote merge — a separate production publish needing its own order. No pipelines: the default-branch merge is the publish. Direct-push repo: every push is.
- **Provision the interior up front** — deterministic harness, decisions pre-made in the brief, scoped read-credentials if genuinely needed — so the loop can run start-to-terminal without needing the human mid-flight.

## Agentic delivery flow

The ADF is the macro verified loop. Agent owns `SPEC → PLAN → TDD → DEV → E2E`. Stop here — publish (review-to-merge) is the human's (the Boundary). SPEC and BRIEF author the verifier's spec; TDD and E2E *are* verified loops at different altitudes (TDD = write the harness red, loop DEV to green; E2E = run the broad harness against the live system).

- Command discovery order: repo task runner/scripts → repo docs → project defaults (`tilt up`, `silo up`) → ask user.
- High-risk changes (approval required in PLAN): schema/data migrations, auth/security boundaries, public API/contract changes, infra/deploy/runtime config.
- Low-risk skip path: docs/comments/non-runtime changes may use `SPEC → PLAN → DEV`.
- Traceability: every change maps REQ-* → tests → commit.
- If deviating from this flow, record a waiver with rationale.
- Gates:
  - SPEC: IDs, invariants, non-goals, acceptance criteria. Risk tags when high-risk items exist. Load `spec-best-practices`. File named `SPEC.md`, colocated.
  - PLAN: task graph with files/types/tests and risk classification. Data-plane work (per-item/per-request hot paths) includes a back-of-envelope resource sketch; control-plane code may be slow and safe.
  - TDD: a new test is observed red against the pre-fix tree before the fix lands — run it and cite the red output; a test first seen green proves nothing about what it guards.
  - DEV: local environment boots; health checks pass.
  - E2E: happy path and failure modes pass against live dev environment.

## Core principles
- Explore relevant code before proposing changes; understand context first.
- Work idiomatically and safely; align with project conventions and architecture.
- Keep changes minimal and focused; implement only what is requested or clearly necessary.
- Use available tools/documentation before coding; verify assumptions.
- Live-state first for mutations: before any config-value or state-mutating change, read the current live state — if the change is already applied, no-op and report.
- Complete implementations or fail explicitly with descriptive errors; partial work masks bugs.
- Declare variables at the smallest scope, computed closest to use — most bugs are a semantic gap opened by distance in time or space.
- Extract configuration immediately; magic numbers, URLs, ports, timeouts, and feature flags belong in config, not code.

## Agent context
- Default to analysis/plan/recommend; edit files or run mutating commands only when explicitly requested or clearly implied. Ask when ambiguous.
- Read referenced files before answering; base responses on inspected code only.

## Shell environment
- `.envrc` files are auto-loaded by direnv via `~/.zshenv`; each `cd` (including `pushd`/`popd`) re-exports the target directory's env before the command runs.
- Do not run `direnv allow`, `source .envrc`, or `eval "$(direnv export ...)"` — the hook already did it. Just `cd` and use the vars.
- If an expected `.envrc` var is missing, the `.envrc` is blocked (unallowed) or the file is absent; read it before inventing workarounds.

## Secret handling

Treat secret safety as a hard requirement. Secrets are part of the Boundary — the autonomous loop must never reach for one.

- Assume all chat content, tool inputs, and tool outputs are persisted; do not place secret values in them.
- Never ask for or accept secrets in plain text via chat.
- Never echo, print, or log secret values to stdout/stderr.
- Never pass secrets as command arguments (`--token ...`) or inline env assignments (`TOKEN=... cmd`).
- Never write secrets to disk unless explicitly authorized for an approved secure store.
- Pipe from secret manager to stdin: `op read <ref> | <command-that-reads-stdin>`.
- If a tool only accepts argv/env/file plaintext, stop and ask for an approved alternative.
- Redact suspected secrets immediately if they appear in output.
- Never resolve a push or auth failure by mutating global credential config — no `gh auth setup-git`, no added https credential helper, no widened agent cache. A hung ssh-agent, an unmet biometric, or a pending 1Password approval is a Boundary event: surface it and stop, never reroute around it.

## Type-first development

Types are the cheapest verifier: the compiler is free, instant, and always on. Push verification into the type system.

- Define types, interfaces, and data models before implementing logic.
- Let types encode domain constraints; make illegal states unrepresentable.
- When modifying existing code, understand the type signatures first.
- Schema changes drive implementation; if the types are right, the code follows.

## Assertions and bounds

Assertions are the runtime rung of the verifier ladder — types at compile time, assertions at run time, tests at loop time, the oracle at review time. They ship inside the artifact and stay on duty when nobody is watching, and they make the loop itself converge faster: an assertion failure is loud, located evidence; silent corruption is not.

- Programmer errors and operating errors are different species. Operating errors (bad input, timeouts, full disks) are expected: handle and report. Programmer errors (violated invariants) are impossible-by-design: assert and crash. Never handle the second; never assert the first.
- Assert the preconditions, postconditions, and invariants a function relies on; code must not operate blindly on data it has not checked.
- Assert the positive space (what must be true) and the negative space (what must never happen). Bugs live on the valid/invalid boundary — tests exercise the transition across it, not just each side.
- Pair assertions: enforce one property at two independent points (before write / after read; producer / consumer).
- Prefer the cheaper rung: compile-time checks (const asserts, exhaustive matches) over runtime asserts over tests.
- Put a limit on everything: every loop, queue, buffer, cache, and retry has an explicit upper bound; recursion carries an asserted depth bound. Intentionally infinite loops (event loops) assert that they are.
- A blatantly true assertion is stronger documentation than a comment when the condition is critical and surprising.

## Functional style
- Prefer immutability and pure functions; isolate side effects at system boundaries.
- Compose small functions; prefer pipelines over in-place mutation.
- Push `if`s up and `for`s down: the parent owns control flow and state; helpers compute changes rather than apply them; leaf functions stay pure.

## Test integrity

This is harness faithfulness in practice. Tests verify correctness — they do not define the solution. When tests fail, investigate root cause and fix the underlying issue. Do not hard-code values, weaken assertions, or game around tests. If a test appears incorrect, report the issue. A fix that closes an independent-review finding still owes an observed red: the reviewer's code-level judgment locates the bug but does not reproduce it, and a green-only test can hide a fix that never touched the real failure.

Root-cause over route-around: never label a failure "pre-existing" or "unrelated", and never defer a discovered bug, without cited evidence (recall, git log, session history). In bug-bash/dogfood/QA stages, bugs found are fixed in-session.

## Test realism

The harness is a proxy; the live system is the final gate. Keep the proxy faithful and periodically check it against the gate.

- Prefer integration tests over mocked unit tests for data flow and permissions.
- Mocks are acceptable for external services but not for your own data layer.
- If a test passes with mocks but would fail against the real system, the test is wrong.
- For visual/UI changes the floor is the change observed on the live surface — a screenshot of the running app or an executed e2e; green unit tests or CI alone never clear it.
- Before claiming done: "would this survive a manual walkthrough?"

## Error handling
- Errors must be handled or propagated to the caller — never swallowed; validate at system boundaries rather than re-checking internal invariants everywhere.
- Fail loudly with clear messages; silent failures compound into system-wide issues.
- Handle edge cases explicitly (empty inputs, nil/null, default branches).
- External calls need explicit timeouts; retries must be bounded with backoff.

## Refactoring
- Update all callers when changing interfaces; clean breaks over backward-compatibility shims.
- Prefer clean, complete migrations over gradual transitions.
- Commit to one implementation and delete superseded code; trust version control.
- Supersession is the default: when a directive names a single source of truth ("rely on X, not Y") or a new component replaces an old one, plan Y's removal as part of the change; if replace-vs-add is genuinely ambiguous, confirm in one line.
- Review findings never restructure a PR or rollout without explicit confirmation.

## Naming

- Get the nouns and verbs just right; a great name is a crisp mental model of what a thing is or does.
- Do not abbreviate names; long-form flags in scripts (`--force`, not `-f`).
- Units and qualifiers go last, sorted by descending significance: `latency_ms_max`, not `max_latency_ms` — related names group and line up.
- Infuse names with the semantics the reader needs to act: `arena` vs `gpa` tells a Zig reader whether `deinit` is owed; a noun (`pipeline`) beats a participle (`preparing`) because it composes into prose and derived identifiers.

## Code comments

Comment liberally. Every comment must explain intent, rationale, or non-obvious constraints — never restate what the code does. Good comments answer "why this approach?" and "what would break if this changed?"

## Communication style
- Concise teammate tone; plain text without emojis; brevity over perfect grammar.
- After tool use, give a one-line status of what was done/found.
- Use brief bullets when it improves scanability; paths in backticks; code fences only when helpful.
- Technical documentation in third person; instructions in second person; avoid first person.

## Skills

Load the relevant best-practices skill when working with a supported language or tool; load multiple when contexts overlap (e.g., typescript + react for `.tsx` files).

| Context | Skill |
|---------|-------|
| Python (`.py`, `pyproject.toml`) | python-best-practices |
| TypeScript (`.ts`, `.tsx`, `tsconfig.json`) | typescript-best-practices |
| Electrobun (`electrobun.config.ts`, `electrobun/*`) | electrobun-best-practices |
| React (`.tsx`, `.jsx`, `@react` imports) | react-best-practices |
| Go (`.go`, `go.mod`) | go-best-practices |
| Zig (`.zig`, `build.zig`) | zig-best-practices |
| Rust (`.rs`, `Cargo.toml`) | rust-best-practices |
| Playwright (`.spec.ts`, `.test.ts` with `@playwright/test`) | playwright-best-practices |
| Tilt (`Tiltfile`, tilt commands) | tilt |
| Tamagui (`tamagui.config.ts`, `@tamagui` imports) | tamagui-best-practices |
| Atlas (`atlas.hcl`, `.hcl` schema, Atlas CLI) | atlas-best-practices |
| SPEC.md authoring | spec-best-practices |
| BRIEF.md authoring / defining what "good" means for a surface | brief-best-practices |
| Test design from specs | testing-best-practices |
| Git operations | git-best-practices |
| Changeset ready for human review / user reviewing in hunk | hunk-notes |

## Implementation checklist

The loop's exit checklist — all must hold at `done`:

- Functions implemented or explicitly error.
- TODOs accompanied by failing stubs.
- Solutions work for all valid inputs; avoid hard-coded values that only satisfy test cases.
- All paths handled; external calls checked for errors/timeouts.
- Edge cases covered; switch/default cases present.
- Tests/linters/builds run when applicable.
- Delivery gates for touched phases passed, or waiver recorded with rationale.
- Non-trivial changeset handed for human review carries a `.hunk/agent-context.json` rationale sidecar (see `hunk-notes`), unless opted out.
