---
name: hunk-notes
description: Use when the user asks for hunk notes or a review sidecar for a changeset, or is reviewing your changes in a live hunk session.
---

# Hunk Notes

`hunk` is a terminal diff viewer for agent-authored changesets. Agents write a
`.hunk/agent-context.json` sidecar so their rationale rides alongside the diff,
and steer a running session from the CLI. Humans open the viewer; **agents
never launch the TUI.**

## When

- **On request only.** Write the sidecar when the user asks for it. A changeset
  reaching review handoff is not a trigger, however non-trivial it is.
- Delegated work: when a worker produced the changeset (e.g. a delegation driver
  supervising a worker), author the sidecar from the packet outputs and reviewer
  verdicts, not from a re-read of the diff alone.

## Write the sidecar

Path: `.hunk/agent-context.json` at the repo root.

```json
{
  "version": 1,
  "summary": "one line: what this changeset does",
  "files": [
    {
      "path": "src/foo.ts",
      "summary": "what changed in this file and why",
      "annotations": [
        {
          "newRange": [12, 18],
          "summary": "short note title",
          "rationale": "why this approach / what breaks if it changes",
          "author": "<your agent or model name>"
        }
      ]
    }
  ]
}
```

- `newRange` targets the new side, `oldRange` the deleted side; both are
  1-based inclusive `[from, to]` ranges. They are the **same line numbers
  `git diff` shows** — hunk renders that diff, so read the numbers from git, not
  by opening hunk. A new/untracked file is all additions, so `newRange` is just
  the file's own 1-based lines (`git add -N <file>` makes it show up in
  `git diff`).
- `files` order is the order a reviewer should read them — **narrative order**,
  not alphabetical.
- **Few notes, real rationale.** A note earns its place by explaining intent, a
  tradeoff, or a landmine. Never narrate what the diff already shows.
- **Regenerate, don't accrete.** When the diff changes, rewrite the sidecar
  from scratch — stale ranges point notes at the wrong lines.
- Keep the sidecar out of commits (add `.hunk/` to gitignore); hunk excludes
  its own sidecar from the rendered diff.

## Use STML when structure helps

For notes that benefit from visual hierarchy — verdicts, risk callouts,
pipelines, scorecards, or checklists — add optional STML in
`annotations[].markup`, `comment add --markup`, or a `markup` field on
`comment apply` items. Keep `summary` a real sentence: it is the plain-text
fallback and list-view text. Ordinary notes should stay plain.

Run `hunk markup guide` before authoring STML. For a live session, read
`noteMarkupWidth` from `hunk session context --json`, preview with
`hunk markup render - --width <that-width>`, and fix any `markupNotes`
reported by preview or comment responses.

## Match what the human will view

Ranges only make sense against the diff hunk shows the reviewer:

- Working tree (the human's `hunk diff`, which includes untracked files) —
  write the sidecar **before committing**, and number against the working-tree
  diff.
- A commit or ref (the human's `hunk show <ref>`) — number against that ref.

Auto-discovery of `.hunk/agent-context.json` is available in some hunk builds;
where it isn't, the human passes `--agent-context .hunk/agent-context.json`.
Writing the file is the same either way.

## Steer a live session

When a human has hunk open, drive their session over the local daemon — never
open a second view. `<repo>` is the repo root (`git rev-parse --show-toplevel`);
pass it explicitly, since the shell's working directory is not guaranteed:

- `hunk session list` — find live sessions and their IDs.
- `hunk session get --repo <repo>` — session state (focus, file/comment counts).
- `hunk session review --repo <repo> --include-notes --json` — read the review
  model, including live notes.
- `hunk session navigate --repo <repo> --file <path> (--hunk <n> | --new-line <n> | --old-line <n>)`
  — move the reviewer's viewport.
- `hunk session comment add --repo <repo> --file <path> (--new-line <n> | --old-line <n>) --summary <text> [--rationale <text>]`
  — attach one inline note.
- `hunk session comment apply --repo <repo> --stdin` — batch notes as JSON
  `{ "comments": [ { "filePath", "hunk"|"oldLine"|"newLine", "summary", "rationale", "author" } ] }`;
  each comment carries exactly one line target.
- `hunk session reload --repo <repo> -- diff [ref]` (or `-- show <ref>`) —
  repoint the open session after the diff changes.

If more than one live session matches a repo root, target the session ID from
`hunk session list` instead of `--repo`.

## Never

- Never launch the hunk TUI (`hunk diff` / `hunk show`) — the human opens the
  viewer; agents only write the sidecar and steer live sessions.
- Do not rely on `hunk skill path`; it does not resolve on compiled builds.
