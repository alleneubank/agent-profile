# Hosts

What the fleet watch knows about reading hosts through sox. Checked against
sox v0.3.30; when the installed version differs, check `sox help <command>`
before trusting a line.

## The watch stream

`fleet-watch.sh watch` is one `sox watch --all` stream over every shell, with
the fleet watch's own shell dropped (otherwise each reply it posts ends a turn,
prints `done`, and wakes it again). What its lines mean:

- A `HOST` line comes only after a host stays `unreachable` past 60 s, and
  again on recovery. One-tick flaps on healthy masters are routine: sox
  v0.3.30 had 15 in 37 minutes, all `RemoteHomeExecutionFailed` or
  `RpcTunnelFailed` (0xsend/sox#1153).
- `GONE MID-WORK` is a shell that exited while `working` or `blocked`. Often
  that is its coordinator's own retire: check its lane's report or exit file
  before calling it a death. A `none → gone` exit (headless or short-lived
  shell) is not reported.
- Headless lanes (`claude -p`, `codex exec`) report no attention, and a
  coordinator's `done` says only that its turn ended.
- Run one stream per watcher. Every `watch --all` subscriber re-resolves HOME
  and opens a fresh RPC tunnel to every host on every tick, so each extra
  stream or `sox ls` loop adds load to the shared masters.

## Telling sox from SSH

Probe a host's master directly:
`ssh -S ~/.sox/ssh/<id>.sock -o ControlMaster=no -o RemoteCommand=none <ssh_host> true`.
`<id>.sock` is the `-S` path on that host's `ssh -M` process. Without
`RemoteCommand=none`, a host whose ssh config sets a `RemoteCommand` fails
with `Cannot execute command-line and remote command`. A fast success while
sox reports the host `unreachable` puts the fault in sox's own exec path,
whose trace names only the error category.

A host entry whose `ssh_host` is this machine's own name is a self-target. It
stays on the SSH path by design (REQ-LSX-106), and while several subscribers
run it reads `unreachable` almost continuously (0xsend/sox#1152). If its
private home (`~/.sox-self-*`) holds no shells (`SOX_HOME=<that home> sox
ls`), `sox host rm <name>` removes the duplicate and `localhost` still covers
the machine. Launch on the control host with a bare `sox new`, never
`sox new <control host>`.

## Drift checker

While many coordinators run at once, the fleet watch also starts
`lane.sh drift --fleet <caps file> --every 300 --stop-at <end>` in a sox shell
on the control host labeled `role=fleet-check`, and kills it at the end. It
costs no agent turns; its findings are in `~/.handoffs/fleet-drift.txt`.
