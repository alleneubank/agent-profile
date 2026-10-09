---
name: papercuts
description: Use when you worked around friction in your own tools or environment during a task (a misleading or failing command, missing setup, a dead-end tool call, an unhelpful error, a stale doc), or when asked to triage papercuts.
---

# Papercuts

Agents usually push through friction in silence, so the human never learns
what keeps slowing work down. Report it as it happens, in one line, and keep
working; triage happens later, in batches, where a shared cause shows.

## Report

Run [scripts/papercut.sh](scripts/papercut.sh) with what slowed you down and
how you got past it:

```sh
papercut.sh "zmx run -d held the ssh call open; ran it under nohup instead"
```

The script records the time, host, repository, and branch in this host's
queue, `~/.handoffs/sharpening/papercuts.md`.

- Report friction in the setup: tools, harness, instructions, skills, docs,
  environment. A defect in the product you are building belongs in the task
  or its issue tracker, not here.
- Name the tool, command, or file and the workaround. Do not paste secrets,
  tokens, or private data; describe them.
- One report per distinct papercut. Do not stop the task to fix it unless it
  blocks the task.

## Triage

When the human asks, run `papercut.sh --take` on each host whose queue is
wanted. It moves the queue to `triaged/` and prints the path; reports written
meanwhile start a fresh queue.

1. Group reports by cause, not by wording. Several reports with one cause
   are one item.
2. Route each item to the source that owns the fix: the project repository,
   the shared tool's own repository, agent-profile for instructions and
   skills, dotfiles for installation and configuration. Never patch an
   installed copy.
3. Fix small items within the human's authorization, verified like any other
   change. List the rest with their owner and the reports behind them.
4. A cause seen in several separate tasks or repositories goes to the human
   as a candidate for redesign, with its reports, rather than another patch.

Report what was fixed, what was routed where, and what was dropped as noise.
