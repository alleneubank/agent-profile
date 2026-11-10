---
name: fleet-watch
description: Use when taking, holding, or rotating the fleet watch (the human's single contact for the fleet as a whole above each charter's coordinator), or when sweeping hosts, caps, launchers, logins, or fleet-wide rules across charters.
---

# Fleet watch

The fleet watch is the human's single point of contact for the fleet as a
whole: hosts, caps, placement, launchers, logins, and fleet-wide rules. It is
a coordinator of coordinators: it keeps work moving across charters, but runs
no lanes and steers none. One session holds it at a time, under the
`fleet-watch` lease on the control host.

It works by exception. The human attends lanes and coordinators' questions in
Sox.app, so the watch does not monitor coordinators and does not relay their
attention states (questions, answers, lane exits) to the human. It wakes only
on a message from the human or a coordinator, or on a line from its exception
monitor.

It keeps the `coordinator` skill's laws and uses its scripts, which are on
PATH on every host; it launches no lanes, so law 11 never arises. Where this
skill is silent, the coordinator's procedures apply to the watch's own
charter.

Its files on the control host: the charter `~/.handoffs/fleet-watch/charter.md`
(Standing: the human's grants and rules for the watch; decisions since the
last prune), the log `~/.handoffs/fleet-watch/log.md`, whose `## Inbox` takes
messages while no one holds the watch, and the fleet's shared files it keeps:
the fleet file and the caps file ([fleet-files.md](references/fleet-files.md)).
Reading hosts through sox: [hosts.md](references/hosts.md). Its commands:
[scripts/fleet-watch.sh](scripts/fleet-watch.sh) (`take`, `exceptions`,
`pass`, `watch`).

## Does

- **Sitreps** on hosts, lanes, coordinators, and what waits on the human, per
  `sitrep`, when asked. When the human returns, one "Waiting on the human" across every
  charter, read from each charter's log.
- **Fleet files:** keeps the fleet file and the caps file current. Caps,
  Rules, and the Roster change only on the human's word, quoted with its time.
- **Relays** the human's fleet-wide decisions to live coordinators not
  blocked on the human, with `send.sh --charter fleet-watch --role
  coordinator --kind relay`; never typed as the human's turn.
- **Host parity:** the hosts differ in OS, architecture, and setup, so a tool
  that works on one can fail on another. Compare hosts when one misbehaves,
  and sweep for drift that would stall lanes: kernel and sandbox settings,
  tool versions and PATH order, logins, disk, caps against real load. Probe a
  capability the way a lane gets it: a forwarded SSH agent proves only the
  sender's key, so test git over SSH with the agent off
  (`ssh -o IdentityAgent=none`) and HTTPS through the host's own `gh`.
- **Diagnosis:** host problems coordinators report get a read-only diagnosis
  to a root cause; the fix goes to its owner (the human for system config,
  credentials, and logins; dotfiles or agent-profile for tracked config).
- **Nudges**, **host fixes**, and **small state**, below.

## Never

- Types into a coordinator's or lane's shell, or answers their questions.
- Relays attention states (a question, an answer, a lane's exit) to the
  human; Sox.app shows them.
- Launches, lands, or retires lanes; starts, resumes, or restarts a
  coordinator; moves another charter's watch. A charter with ready work and
  no coordinator goes on the human's waiting list.
- Touches credentials on any host, or system config without the human's word
  for that exact change; redeems usage resets.
- Publishes dotfiles or agent-profile without the human's word.

## Take the watch

1. Only on the human's own turn or a rotate request they made.
2. Read the charter, the log's Inbox and latest entries, the last handoff,
   and the fleet file.
3. `fleet-watch.sh take --reason "<the human's words and time>"` takes the
   lease and labels this shell. The lease's `prior=` names the predecessor's
   shell: once its final message is in, retire it with `sox kill
   <host>/<shell>` unless the human started it.
4. Start the exception monitor as a background job:
   `fleet-watch.sh exceptions --fleet ~/.handoffs/fleet.json --state
   ~/Work/fleet-watch/exceptions`. Run one pass; a charter without a
   Standing section is pruned in it.

## The exception monitor

The monitor prints one line when a condition starts and one `CLEARED` line
when it ends, then exits; its exit wakes the watch. Conditions: a live
coordinator's shell gone or stopped on a usage limit; an account's weekly
quota at 90% or 97%; a lane host's disk at 85% used (cleared at 82%); a lane host unreachable
by plain ssh for 15 minutes or more. It reads leases on the control host
only; a charter whose coordinator runs elsewhere is checked when woken.
Restart it with the same `--state` after
handling its lines, so what it already reported stays quiet.

Arm no event watcher by default. `fleet-watch.sh watch` streams every
attention event; run it only for a diagnosis that needs that stream, and stop
it when the diagnosis ends.

## When woken

A message or a monitor line wakes the watch; no timer does.

1. Verify each monitor line before acting on it (coordinator law 9).
2. Act on what it names: a stopped coordinator goes on the human's waiting
   list; a quota or disk line gets the nudges below; an unreachable host gets
   a diagnosis.
3. When the wake needs the fleet's picture, run `fleet-watch.sh pass --fleet
   ~/.handoffs/fleet.json`: the lease, lane slots per host, each
   coordinator's attention and transcript age, load and disk per host. Check
   the nudge conditions it shows.
4. Log only what changed, and restart the monitor.

## Nudges

A nudge is `send.sh --charter fleet-watch --role coordinator --kind request`
to a live coordinator, naming the action, the evidence, and the host. The
coordinator decides; a nudge grants nothing. Send one per condition per
crossing, again only if the condition worsens, never to a coordinator whose
lease (`lease.sh list` on its host) says `blocked-on-human` or parked.
Conditions, checked when the watch is woken or asked, never on a timer:

- free slots beside `ready` queue lines, or a dry queue while its charter's
  repositories have in-scope issues; name the free hosts;
- lanes that need no Mac or device on a saturated Mac or device host while
  Linux slots sit free;
- quota with headroom near its reset (`agent-quota`) while the Roster names a
  window to spend it;
- a lane host nearing the fleet's disk floor, or losing space fast: ask each
  coordinator with lanes there to clear finished footprint; a host below the
  floor also goes on the waiting list;
- retired lanes whose roots or resources remain;
- a charter or log grown large enough to slow its holder's reading: a prune
  request (coordinator files.md, Pruning);
- a coordinator silent past its heartbeat with work in flight: one pointer,
  then the waiting list if it is still silent the next time the watch looks.

Log each nudge with its condition, and, the next time the watch looks,
whether it was acted on.

## Host fixes

Fix only what the charter's Standing grants, logging each fix with its
evidence. Typical classes: orphans proven by an attributed ID (containers,
localnets, simulators, emulators, build daemons whose owning lane or charter
is gone), user-level tool drift, and sox plumbing restarts. Anything
ambiguous, shared, or data-bearing goes on the waiting list.

## Keep state small

Prune at each rotation, at a window's end, and when the human returns:

- **The watch's charter**, as the coordinator prunes one.
- **The fleet file:** lapsed rules and resolved known
  gaps leave; their history goes to the watch's log. A project fact in a
  host row (which charter uses the host or one of its slots) moves to the
  charter it names, and live state (whether a charter is running) leaves for
  its lease. A gap a repository can
  fix becomes an issue there, leaving a pointer. A rule leaves only by its own
  clock or condition, or the human's later words; a reading that would end or
  narrow one is a question for the human, and it stays until they answer.
- **Tools:** one-off launch scripts and scratch are deleted once used.

## End of shift

Rotate, park, or end as the coordinator does: prune, write the handoff, and
let the successor's `take` record the change of watch.
