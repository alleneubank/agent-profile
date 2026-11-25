---
name: cf
description: Use when inspecting or changing Cloudflare resources with the `cf` CLI — Workers, D1, R2, KV, DNS, zones, or account settings — or when choosing between `cf` and wrangler.
---

# Cloudflare CLI (`cf`)

`cf` covers the Cloudflare API and the developer platform. It is a beta, so
its command surface changes between releases: discover commands from the
installed binary, not from memory or older docs.

## Discover commands

`cf --help` opens with agent instructions; follow them instead of walking
nested `--help`:

- `cf cli search "<task>"` returns five matching commands with summaries.
  Pick the best match rather than rephrasing the same search.
- `<command> --help` for its arguments; `cf schema <command without the
  leading cf>` for the API request behind it.
- `cf docs search "<question>"` for guides; fetch a result's URL as Markdown.

Keep `cli search` and `docs search` queries anonymous: describe the action
and the resource type only. No names, emails, domains, account or resource
IDs, or tokens.

## Account

Auth is per named profile. A directory bound with
`cf auth activate <profile> <dir>` uses that profile; `--profile <name>`
overrides it for one call; anything else falls back to the `default`
profile, if the host has one. That fallback answers successfully under
whatever account `default` belongs to, so a working command does not prove
the right account.

- Before a write, confirm the account: `cf auth whoami` shows the email and
  the profile file it read. If it is not the account the task names, pass
  `--profile`, or find the bound profile in `cf auth list`.
- Bindings match the literal directory path; a symlinked path does not
  inherit the binding of its target.
- `cf auth login`, `create`, `activate`, `deactivate`, `logout`, and `delete`
  change shared host state. Run them only when the user asks. Login is an
  interactive browser flow: hand it to the user.

## Writes

- `--dry-run` shows the parsed command without executing it.
- Deleting or overwriting a resource, a D1 `time-travel restore`, and
  migrations against a production database need the user's confirmation
  first.
- Many commands take a resource ID, not a name (`cf d1 query <database-id>`,
  `cf d1 migrations apply <database>` rejects names and binding names). Look
  the ID up with the matching `list` command.

## Gaps

- `cf d1` has no export. A full `.sql` dump still needs
  `wrangler d1 export <name> --remote --output=<file>`.
- `cf d1 migrations apply` is wire-compatible with
  `wrangler d1 migrations apply` (same bookkeeping table, recorded names,
  and order), so a project can move between the two without reapplying.
- When `cf cli search` finds no command for a task, check `cf docs search`
  before concluding it is unsupported; the answer may be a wrangler command
  or a raw API call through the documented endpoint.
