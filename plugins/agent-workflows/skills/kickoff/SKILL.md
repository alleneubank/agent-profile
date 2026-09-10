---
name: kickoff
description: Use when the user wants to start or resume a bounded unattended or multi-session campaign, execute a tee-up-prepared prompt, create a LOOP.md, or preview a kickoff without running it.
---

# Kickoff

Execute the agreed campaign in the current session. `tee-up` prepares the
objective, acceptance, seed, budget, and boundary; kickoff owns execution and
recovery. Existing authorization survives scope restatement. Review-only requests
and `--dry-run` stop after printing the prepared prompt.

## Resolve the agreement

- **Seed:** an explicitly supplied prompt, file, handoff, or issue. Otherwise
  use root `LANE.md`, then the current branch's issue. Read the actual seed;
  never invent one. A valid existing `LOOP.md` is resumed, not re-seeded.
- **Budget:** the explicit iteration cap, else the existing loop's cap. If both
  are absent, ask once while attended; unattended, record the missing budget
  and stop before starting a campaign. Do not silently raise a cap.
- **Presence:** unattended by default; an explicit attended request wins.
- **Boundary:** preserve the agreed scope and authorization. The default is
  local work only: no push, PR, merge, deploy, release, or issue close. An
  explicit authorization in the agreement overrides that default for its named
  artifact and ref only.
- **Outputs:** every terminal gets a sitrep. When unattended, also save it to
  `~/.handoffs/sitrep-<repo>-<branch>-<date>.md`.

If a fact is missing, investigate the seed and existing contract first. A real
missing seed is `blocked` before iteration 1, with the missing input named.

## Preview or execute

For `--dry-run`, print the fully resolved prompt below and stop. Unresolved
arguments are explicitly labeled; do not invent values. No files are edited,
no campaign runs, and no other skill is loaded just to preview the prompt.

```text
Run kickoff from <seed>, <presence>, with an iteration budget of <n>.
Outcome and acceptance: <resolved agreement or canonical seed reference>.
Boundary: <authorized actions and remaining boundary>.
Report every terminal; when unattended, save the sitrep under ~/.handoffs/.
```

For execution, briefly state the resolved outcome and proceed. Read
[execution.md](references/execution.md) for authoring, iteration, and terminal
handling. Read the [template](references/template.md) only when creating a loop;
consult the [doctrine](references/doctrine.md) when resolving an unsettled
campaign decision. Load `mission-command` for lifecycle operations, `bugbash`
when its gate is needed, and `sitrep` at reporting time. Domain skills load
before the governed action. Kickoff does not pre-load the entire workflow stack.

A recurring scheduler that finds the campaign already closed stops; it never
starts another attempt from the old seed. A fresh attempt needs its own
agreement and loop.
