# Files

## Upload and share a file

```sh
slack files upload report.png --channel C0123456789 --initial_comment 'Weekly report'
slack files upload a.png b.log --channel '<message link>'   # into that message's thread
```

- `--channel` takes a channel id, or a message link, which shares into the
  linked message's thread (its `thread_ts`, else the message). With a channel
  id, `--thread_ts <parent ts>` shares into a thread. Without `--channel` the
  files stay private to the signed-in person.
- Up to 10 paths; `--title` only with one. Output is Slack's
  `files.completeUploadExternal` response, with `files[].id`.
- Needs `files:write` (`slack login --write`). Accepts `--dry-run`.
- Deleting the file (`slack files delete --file F…`) removes a message that
  only shared it, but leaves one with an `--initial_comment`; delete that with
  `slack chat delete <channel> <ts>`.

## Read a file

```sh
slack files download '<message link>' --out /tmp/slack    # every file on the message
slack files download '<message link>' --file F0123456789  # one of them
slack files download F0123456789 --out /tmp/trace.png
```

- The link can be a thread reply; use the link Slack copies, which carries
  `thread_ts`. Files in Slack Connect channels work the same way.
- Saves into `--out` (a directory, default the current one) under each file's
  name, or at `--out` itself for one file; prints each `path`, `mimetype`, and
  `size`. An existing file fails `FILE_EXISTS`; pass `--force` to replace it.
- Messages list their files in `files[]` (`id`, `name`, `mimetype`); a file
  with `file_access: "check_file_info"` shows only its id until
  `slack files info <file>` or a download.
- `FILE_ACCESS_DENIED` means Slack would not serve the file to this login.
- To look at an image, download it and open the saved path.
