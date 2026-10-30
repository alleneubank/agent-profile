---
name: fleet-watch
description: Use when taking, holding, or rotating the fleet watch (the human's single contact for the fleet as a whole above each charter's coordinator), or when sweeping hosts, caps, launchers, logins, or fleet-wide rules across charters.
---

# Fleet watch

The fleet watch is the human's single point of contact for the fleet as a
whole: hosts, caps, placement, launchers, logins, and fleet-wide rules. It is
a coordinator of coordinators: it watches every charter's coordinator and
keeps work moving across them, but runs no lanes and steers none. One session
holds it at a time, under the `fleet-watch` lease on the control host.

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
[scripts/fleet-watch.sh](scripts/fleet-watch.sh) (`take`, `watch`, `pass`).

## Does

- **Sitreps** on hosts, lanes, coordinators, and what waits on the human, per
  `sitrep`. When the human returns, one "Waiting on the human" across every
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
4. Arm `fleet-watch.sh watch` as the event watcher, re-armed like the
   coordinator's lane watcher, and run a pass. A charter without a Standing
   section is pruned in that pass.

## Run a pass

A watch line or the heartbeat starts a pass.

1. `fleet-watch.sh pass --fleet ~/.handoffs/fleet.json`: the lease, lane slots
   per host, each coordinator's attention and transcript age, load and disk
   per host.
2. Verify each watch line before acting on it (coordinator law 9).
3. Nudge, fix, or route what changed. Log only what changed.

While the human is away, a pass runs every 30 minutes until the end of the
window they set, which closes with a final sitrep at the top of the log. A
window sets its end; these terms stand.

## Nudges

A nudge is `send.sh --charter fleet-watch --role coordinator --kind request`
to a live coordinator, naming the action, the evidence, and the host. The
coordinator decides; a nudge grants nothing. Send one per condition per
crossing, again only if the condition worsens, never to a coordinator that is
`blocked-on-human` or parked. Conditions:

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
  then the waiting list if the next pass shows no change.

Log each nudge with its condition, and in the next pass whether it was acted
on.

## Host fixes

Fix only what the charter's Standing grants, logging each fix with its
evidence. Typical classes: orphans proven by an attributed ID (containers,
localnets, simulators, emulators, build daemons whose owning lane or charter
is gone), user-level tool drift, and sox plumbing restarts. Anything
ambiguous, shared, or data-bearing goes on the waiting list.

## Keep state small

Prune at each rotation, at a window's end, and when the human returns:

- **The watch's charter**, as the coordinator prunes one.
- **The fleet file:** lapsed rules, past reservations, and resolved known
  gaps leave; their history goes to the watch's log. A gap a repository can
  fix becomes an issue there, leaving a pointer. A rule leaves only by its own
  clock or condition, or the human's later words; a reading that would end or
  narrow one is a question for the human, and it stays until they answer.
- **Tools:** one-off launch scripts and scratch are deleted once used.

## End of shift

Rotate, park, or end as the coordinator does: prune, write the handoff, and
let the successor's `take` record the change of watch.
