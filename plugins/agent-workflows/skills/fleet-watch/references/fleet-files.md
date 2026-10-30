# Fleet files

The fleet watch keeps these on the control host; every coordinator reads
them. Keep them out of repos.

## Fleet file: `~/.handoffs/fleet.md` on the control host

One file for the whole fleet, whichever host a charter runs on. It holds
machine facts every charter shares and names no project: which hosts a
project's lanes use, its lane directories, and its own never-touch list go in
its charter.

```markdown
# Fleet
Read by every coordinator at start. Machine facts only; project facts live in
each charter.

## Hosts
| Host | Reach (ssh alias, sox name) | OS, cores, memory | Capabilities (toolchains, SDKs, containers, attached devices) | What limits lanes (the cap is in the caps file) | Disk floor | Never touch (the human's own) | Verified |
|---|---|---|---|---|---|---|---|

## Devices
<test devices by id and the host they attach to; devices never to use>

## Roster (the human's; only the human edits it)
| Role | Models | Launchers (personal / Send) |
|---|---|---|
| <coordinator, workers, reviewers in order, mechanical, beta user> | <models> | <launchers> |
- Reviewer: <how the reviewer is picked from its row, e.g. the first whose provider differs from the author's>
- Account: <which tree uses which account's launchers>
- Fallback when a quota runs out: <order>
- Windows: <launcher or tier> until <date or reset> (a lapsed window means it is not used)
- Coordinator skill: reload if your session started before <UTC time>
  (agent-workflows <version>: <what changed in launching, mail, or the lease>)

## Reservations
| Resource (device, host, account) | Owner charter | Until | Notes |
|---|---|---|---|

## Charters
| Charter | Charter file (host:path) | State |
|---|---|---|
```

Whoever deploys an agent-workflows release that changes how lanes launch,
how mail is sent, or what the lease holds sets the Coordinator skill line to
the deploy time, with the human's word since the Roster is theirs, so
coordinators already running reload before their next launch; a skill loads
once per session and is not re-read otherwise.
Verified is the date a fact was last checked on the host. Only `lease.sh state`
writes State; add a registry row with an empty State, then use the command.
State is `live`,
`blocked-on-human` (heartbeat stopped, lease kept; the human's next turn
resumes it), or `parked` (the human stood it down and the lease is released;
a fresh coordinator resumes from the handoff). Who holds a watch, in which
shell and session, is the lease's to answer (`lease.sh show` or `list` on the
charter's host), never a column here. An archived charter leaves the
registry; its charter and log keep its history. A reservation past its Until
is free. Lane counts are read live (`lane.sh slots`), never stored here.

## Caps file: `~/.handoffs/fleet.json` on the control host

Each lane host's cap, set only by `lane.sh cap` on the human's word (or a
provisional call they granted), with the reason. A host with no entry takes
no lanes; a cap of 0 closes it. A temporary cap carries `--until` and the cap
it falls back to (`--after`), so a capacity window lapses on its own. Pass
`--fleet ~/.handoffs/fleet.json` (absolute) to every `lane.sh` call, and
`--fleet-host <control host>` from any other host.

```json
{"version":1,"hosts":{
  "onyx":{"cap":4,"why":"32 cores, shared with echo-metis k3s","set_at":"2026-10-12T02:20:00Z"},
  "aem5":{"cap":6,"why":"capacity window, the human 02:2xZ","set_at":"2026-10-12T02:20:00Z","until":"2026-10-12T16:00:00Z","after":2}}}
```
