# Stack

The coordinator's tools, what each proves, and the traps already hit. The
fleet file names hosts, launchers, and accounts; this file stays host-free.
Checked against sox v0.3.29 and recall 0.35.0 on 2026-09-25; when the
installed version differs, check `sox help <command>` before trusting a row.

## Claude Code adapter

These tool names apply only to a Claude Code coordinator. Other harnesses
use their own decision and wakeup capabilities; a harness without persistent
wakeups cannot hold an unattended watch.

| Need | Tool | Notes |
|---|---|---|
| Decision round | AskUserQuestion | Holds the session until answered; ask only while the human is at the keyboard. |
| Heartbeat | CronCreate | Session-only, fires only while the session is idle, recurring jobs expire after 7 days. Check `CronList` against the lease each pass. |
| Event wakeups | Monitor | Each stdout line is an event; at most 30 minutes, then re-arm. The filter must emit on every terminal state, failures included. |
| Reaching the human away from the terminal | PushNotification | Skipped when they are at the terminal; reaches their phone only through Remote Control. Use for their hands, not progress. |
| Bounded reading | Agent subagents | Die with this session and are invisible in sox: never for work that must outlive a pass. |

## sox (where every agent lives)

Pin the home on every call: `env SOX_HOME=$HOME/.sox sox ...`, run from a
directory whose `.envrc` does not re-point it, such as `/tmp` (the sox
repo's `.envrc` does). A wrong home answers "shell handle not found" for
shells that exist.

Ids: `send` and `kill` take `<host>/<sN.gM>`; `watch`, `wait`, and `label`
take the bare `sN.gM` (their host-qualified forms read `unknown` or time
out today). A bare handle (`s5`) is refused, and a retired generation is
refused by name.

| Need | Command | Proves / does not prove |
|---|---|---|
| Roster | `sox ls [host] [--json]` | Each answering daemon's rows now, with labels. A silent host still exits 0: check `complete` in `--json`. `no-reply`, `unknown`, and `cold` do not mean dead. `cmd` shows a wrapper shell (`zsh`, `bash`) or a version string for a running agent: confirm the agent with `ps` on its host. |
| Attention | `sox watch <sN.gM> --until done\|blocked --timeout 3` | Last observed state (exit 3 on timeout). An agent waiting on its own question, or one held at a [startup dialog](#startup-dialogs), can still read `working`: read its latest turn. |
| Message | `sox send <host>/<sN.gM> --expect-fg <cmd as sox ls prints it> --enter < relay-N.txt` | Delivery only; stderr names the shell, command, and cwd it reached. Without `--enter` the text sits unsubmitted, and a send into a finished row still reports sent. Confirm a new user turn in the agent's transcript. A relayed line looks like the human's typing to the lane, which is why it carries its provenance. |
| Launch | `sox up <host>:<abs path> --detach --no-forward-agent --no-chrome --no-ext --exec -- <run.sh>` | The last output line is the new `sN.gM`: a minted shell, not a running agent. Local work uses `localhost:<path>`; a bare path is read as a host. Forward the agent only when the brief needs the human's keys on that host. |
| Label | `sox label <sN.gM> owner=<charter> lane=<l>` | Labels belong to that generation only. If it fails, `ssh <host> '<host SOX_HOME> ~/.sox/bin/soxd label <sN.gM> k=v'` has worked. Your own shell is `$ZMX_SESSION`; label it `role=coordinator charter=<name>`. |
| Wait | `sox wait <sN.gM> --timeout S` | Exit code of a `--detach --exec` task (3 timeout, 42 gone); not task success. |
| Retire | `sox kill <host>/<sN.gM>` | Only shells you can attribute; `--prove-gone` when the process already died outside sox. Never a bare `sox down`. |
| Shell of a process | `sox which <pid>` | Local host only. |

Write each message as one line with no trailing newline (the Write tool does
this) and send it on stdin: inline, an apostrophe breaks single quotes, and
double quotes run any backticks in the line. Multi-line text arrives as a paste the
agent may refuse: write a file, copy it, send a pointer. Headless agents
(`claude -p` and similar) cannot read typed input: reach them with files and
a relaunch. pi may not submit on `--enter`; confirm the turn landed, and try
`--key enter` before concluding it is stuck.

## Launching a lane agent

Put the launch in a `run.sh` in the lane's brief directory and pass it to
`sox up ... --exec -- <run.sh>`. Everything after `--` is argv with no shell,
so the script owns `cd`, `direnv exec`, redirections, and writing the exit
file. The agent's exit ends the shell; for an interactive lane the human may
attach to later, end the script with `exec "$SHELL" -l` so the pane stays.

Start the agent under the human's interactive shell:
`zsh -ic 'cd <worktree> && direnv exec . <launcher> ...'`. Credentials the
interactive rc resolves (a package-registry token, for one) never reach a
non-interactive `bash` script, so installs there run anonymously and fail on
private packages. Never write the credential into the brief, argv, or env
yourself.

A headless agent (`-p`, `exec`) ends when its turn ends, and anything it left
in the background dies with it: briefs say to run gates in the foreground.

Name every agent after its lane, the same string as its sox `lane=` label
(e.g. `<charter>-<lane>`), so the harness's resume picker, recall, and the
sox roster agree. Pass the brief as a one-line pointer, not its contents.
Checked 2026-09-28 against claude 2.1.284, pi 0.87.1-fork, codex 0.157.1-fork,
grok 1.0.41-fork, and kimi 2.1.1:

| Harness (launchers) | Name at launch | Interactive | Headless |
|---|---|---|---|
| Claude (`yoloclaude`, `syoloclaude`, `yolo<model>`) | `-n <name>`; recorded as the session title, headless too | `yoloclaude -n <name> "Read <brief> and carry it out."` | `yoloclaude -p -n <name> "<pointer>"` |
| pi (`pigrok`, `pik3`, `piglm`, ...) | `-n <name>` | `pigrok -n <name> "<pointer>"` | `pigrok -p -n <name> "<pointer>"` |
| Codex (`yoloastra`, `syoloastra`, ...) | none; `resume`, `queue`, and `archive` accept a name once the session has one | `yoloastra "<pointer>"` | `yoloastra exec "<pointer>"` |
| Grok | none; `-s <uuid>` fixes the session id instead | `grok "<pointer>"` | `grok -p "<pointer>"` |
| Kimi | none | `kimi` (no initial-prompt argument) | `kimi -p "<pointer>"` |

For a harness with no name flag, the sox label and the brief directory are
the lane's name: find its session with `recall live` by cwd, and record the
session id in the brief directory once it appears.

### Startup dialogs

Interactive Claude Code stops before its first turn on a blocking dialog
when it starts in a directory its account has not answered for: folder trust
(default "No, exit"), "Allow external CLAUDE.md file imports?" (every
worktree under `~/alleneubank` inherits ancestor `CLAUDE.md` files whose
`@AGENTS.md` resolves into dotfiles), and `.mcp.json` server approval.
`--dangerously-skip-permissions` skips none of them, headless `-p` never shows
them, and no setting or flag prevents them. A sendapp-style bare-repo worktree
always asks; a worktree of an ordinary checkout shares the main checkout's
answers. Each account keeps its own answers: `~/.claude.json` for the
`yolo*` launchers, `~/.claude-send/.claude.json` for `syolo*`.

Before launching Claude in a worktree you created, answer them under the
human's standing grant:
`claude-pretrust --fix [--config-dir ~/.claude-send] <worktree>` (on the lane
host). It writes only what the grant covers: trust when another checkout of
the repository is already trusted, imports when every external one lands in
dotfiles `profiles/instructions`, and the servers `.mcp.json` names. Exit 3
means the grant does not cover this worktree and nothing was written: the
human answers it. Never answer a dialog by keystroke.

Proof of start is the agent's transcript with its first turn:
`~/.claude/projects/<cwd with / and . as ->/<id>.jsonl` holding an
`assistant` entry, or its row in `recall live`. The file can appear before the
first turn, and a live sox row or a `working` watch state proves nothing. With
no first turn within 90 seconds, put the agent on the waiting list as
"not started" and give the human its `sox attach` command; sox cannot show you
the pane, and the dialog's default answer exits the agent.

## recall (what every agent said and did)

| Need | Command | Notes |
|---|---|---|
| Who is active | `recall live --json`, plus `recall live --fleet --json` for the other hosts | `--fleet` covers only the hosts in `~/.config/recall/fleet.toml`. Liveness is transcript activity and hooks touch files: confirm with sox or `ps`. Subagent transcripts appear as rows. |
| An agent's latest turn | `recall show <full id> --tail 20 --fresh --json`, then `--after '<cursor>'`; on another host, `ssh <host> 'recall show <id> --tail 20'` | Read `turn` for working or awaiting input. `--fleet` refuses `--tail`, and `--fleet --message-limit` returns the oldest messages. An id prefix is not found. |
| Was it already answered | `recall show <id> --tools --json` | The human's messages and question answers in that lane, before you ask them. |
| Search | `recall search "<phrase>" [--fleet] --json` | A plain JSON array; no `--since` or `--project`. Coverage warnings go to stderr: keep stderr out of the JSON stream, and treat an empty result as unproven absence. |
| Session to shell | none directly | Join on cwd and `sox ls`, or the agent's pid with `sox which <pid>`. |

## Git and the forge

- What landed is what the remote ref and the forge say, not a report.
- Stack work that edits the same files, one PR per layer.
- Never bypass hooks; land through the workspace's scripted path; push with
  explicit refspecs and lease-guarded force.
- A lane launched with `--no-forward-agent` has no SSH agent, so `git fetch`
  over SSH fails there: read refs with `gh api`, or fetch on the coordinator's
  side and say so in the brief.

## Independent review

A second model family reviews a lane's diff as a one-shot print-mode run of a
launcher the fleet file lists: a read-only brief, run in a detached worktree
of the lane's ref, writing a verdict file. Only the prompt keeps it
read-only, so give it a checkout whose writes cannot land.

## Credentials

- Probe the way the work will run: `sox up` on the lane's host and worktree
  with its forwarding flags, `--exec` a script that calls the consumer's own
  resolver.
- fnox runs one daemon per exact flag set: warm through the consumer's own
  resolver and check with `fnox daemon status` under the same flags. `fnox
  check` resolves nothing, so it warms nothing.
- On Linux hosts, `op` forwards to the Mac's 1Password: "not signed in" is
  normal, and a read needs the human's approval on the Mac.
- SSH signing: test from the host that will push, through the agent it will
  use; a forwarded agent makes a remote host look self-sufficient.
- Unattended ssh to a host that needs it: the automation key options the fleet
  file lists, so a lapsed agent fails fast instead of waiting on a prompt.

## Shell traps

- zsh: `$var:r` and similar are modifiers; write `${var}` before a colon.
  Split words with `${=var}`. `===` at the start of a word is an error.
  A command sent over ssh runs in the remote login shell, zsh on fleet hosts,
  so `set -- $x` there does not split either.
- Chain landing steps with `&&`, never `;`.
- Write briefs locally with the file tool and copy them; heredocs inside ssh
  quotes break on apostrophes, and a hook guard denies any shell command whose
  text names a git hook-bypass flag, even in a brief's prose.
