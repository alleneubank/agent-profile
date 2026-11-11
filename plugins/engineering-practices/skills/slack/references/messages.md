# Messages

## Threads

- Reply: `slack chat postMessage <channel> --thread_ts <parent ts> --text '…'`.
  `--reply_broadcast true` also shows the reply in the channel.
- A reply's `thread_ts` is its parent's `ts`; a parent with replies has
  `reply_count`.

## Direct messages

`slack conversations open --users U0123456789` returns `channel.id` (`D…`);
post there with `slack chat postMessage <that id> --text '…'`. Several
comma-separated users open a group DM.

## Formatting

Message text is Slack mrkdwn, not Markdown:

- `*bold*`, `_italic_`, `~strike~`, `` `code` ``, triple-backtick blocks, and
  `> quote`. `**bold**` and `# heading` show literally.
- `<@U0123456789>` mentions a person and `<#C0123456789>` links a channel; a
  plain `@name` is not a mention. `<!here>` and `<!channel>` notify everyone
  in the channel: confirm with the user first.
- Links are `<https://example.com|text>`. Escape a literal `&`, `<`, `>` as
  `&amp;`, `&lt;`, `&gt;`.

- In a shell, pass real newlines (`--text $'line one\nline two'`); a `\n`
  inside double quotes is sent as a backslash and an `n`.

## Edit, delete, schedule

- `slack chat update <channel> <ts> --text '…'` and
  `slack chat delete <channel> <ts>`; Slack answers `cant_update_message` or
  `cant_delete_message` for messages the person may not change.
- `slack chat scheduleMessage --channel C… --post_at <unix seconds> --text '…'`;
  `slack chat scheduledMessages list` and `slack chat deleteScheduledMessage`
  manage pending ones.
