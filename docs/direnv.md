# direnv in agent tool calls

Agents run each tool call in a fresh, non-interactive shell. direnv's normal
hook is prompt-driven, so it never fires there and an allowed `.envrc` silently
does not reach the agent — the symptom is a token or a `PATH` entry that is
present in your terminal and absent in the agent's.

This is a shell-configuration problem, not something a plugin should solve. A
hook that rewrites the command to load direnv works, but the rewritten command
then contains `$(...)`, which Claude Code and Codex cannot statically analyse,
so every `Bash(...)` allow rule stops matching and each call needs approval.
Fix the shell instead; the environment then arrives before the tool call is
even matched, and nothing about permissions changes.

Three shells need covering, because each reads a different startup file:

| how the agent spawns its shell | file that runs | harnesses |
|---|---|---|
| non-interactive `zsh` | `~/.zshenv` | Claude Code, Codex |
| `bash -lc` (login) | `~/.bash_profile` | Codex and others |
| `bash -c` (neither login nor interactive) | **`$BASH_ENV` only** | pi |

The third is the one that is easy to miss: plain `bash -c` reads no startup
file at all, so `BASH_ENV` is the only hook that reaches it.

In each file, when the shell is non-interactive, run a one-time
`eval "$(direnv export <shell>)"` instead of installing the prompt hook, and
override `cd`/`pushd`/`popd` to re-export so a mid-command directory change is
picked up. For the `bash -c` case, point `BASH_ENV` at a small loader that does
the same. This repo's companion dotfiles carry a worked implementation in
`shell/.zshenv`, `shell/.bash_profile` and `shell/.direnv-bash-env.sh`.

Two traps worth inheriting from that implementation:

- **Guard against recursion.** `direnv export bash` evaluates the `.envrc` with
  bash, and that bash inherits `BASH_ENV` and sources the loader again. Clear
  it for the call — `eval "$(BASH_ENV= direnv export bash)"` — or the first
  agent tool call in an `.envrc` directory hangs forever.
- **Gate the loader** on an agent marker (`CLAUDECODE`, `CODEX_THREAD_ID`,
  `PI_CODING_AGENT`) and on an `.envrc` actually being in scope, found with a
  pure-builtin walk up the tree. `BASH_ENV` is read by *every* non-interactive
  bash on the machine, so without both gates every shell script on the system
  pays for a direnv fork.
