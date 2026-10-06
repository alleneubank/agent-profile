---
name: playwriter
description: Use when driving a person's real Chrome through the playwriter CLI — opening sessions, running `-e`/`-f` scripts, downloading files, or reading sites they are signed in to.
---

# playwriter (`playwriter`)

playwriter drives a human's own Chrome profile: a Chrome extension connects to
a local relay process, and `playwriter -s <session> -e '<code>'` runs Playwright
code against that profile's tabs, cookies and sign-ins included.

`playwriter skill` prints upstream's full guide (about 1,400 lines: the
observe-act-observe loop, `snapshot`, `getLatestLogs`, selectors, network
interception). Read the sections the task needs. This skill carries what
upstream does not say: the relay is a shared failure domain, the credentials
belong to the human, and downloads are untrusted files. Facts below were
verified on playwriter 0.7.0; recheck `playwriter --help` when the version
changes.

## Law 1 — Your code runs inside the shared relay; no async error may escape

`-e` and `-f` code runs in a `vm` context inside the relay's own Node process,
and the relay exits on any unhandled rejection or uncaught exception. One
escaped error ends the relay and **every session on it, including other
agents'**, and every session's `state`. The relay log records no reason, and
the CLI reports only `Error: fetch failed`.

Both of these kill it (reproduced on a scratch relay):

```js
const dl = page.waitForEvent('download', { timeout: 60000 })
await link.click()   // still pending when dl times out: dl rejects unhandled
await dl

setTimeout(() => { throw new Error('x') }, 500)   // throw outside the awaited chain
```

The rule: **every promise you create is awaited or has a handler attached the
moment it exists, and callbacks (timers, `page.on` handlers) catch their own
errors.** For an event and the action that triggers it, start both together:

```js
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 30000 }).catch(() => null),
  link.click({ noWaitAfter: true }),
])
if (download === null) throw new Error('no download event; check the downloads folder by name')
```

A rejection inside `await` is fine: it is reported to the CLI and the relay
survives. `noWaitAfter` stops `click()` hanging on a navigation or popup the
link starts.

Keep each call short and do heavy synchronous work (parsing large data) outside
the relay: print the data and process it in your own process. A relay whose
event loop stalls for about 20 s fails the CLI's liveness probe, and the next
CLI call from any agent SIGKILLs it (read in source, not reproduced).

After `Error: fetch failed`, the next call auto-starts a fresh default relay
(a per-port relay must be restarted with `serve`, below): old session ids are
gone, so create a new session. If others were using that relay, tell
the human their sessions died too.

## Law 2 — The human signs in; the agent never types credentials

Never enter a password, one-time code, or passkey, and never read one out of a
vault into the page. When a page redirects to sign-in, stop and ask the human
to sign in in a tab of your session's tab group, then continue in their tab
(`context.pages()` lists it). Scripts check for the sign-in page and fail with
a message naming the site, rather than scraping a login form as data.

## Law 3 — Downloads are untrusted files in the human's downloads folder

Through the extension, Chrome itself saves a download to its download directory
(default `~/Downloads`) under the site's filename, **even when Playwright never
reports the `download` event**. Before triggering a download again, look for
the file there by name; a retry otherwise leaves `name (1).pdf` duplicates.
Move each file by name into a new, empty directory of its own and treat it as
untrusted input (for Python, `python -I`, with your script outside that
directory). `download.saveAs()` needs an absolute path.

## Sessions

```bash
playwriter browser list                    # connected profiles and their keys
playwriter session new --browser <key> --tab-group <name>   # prints the session id
playwriter session list                    # id, profile, tab group, cwd, state keys
playwriter -s <id> --timeout 60000 -e '...'
playwriter -s <id> -f scripts/task.js      # same sandbox, no shell quoting
```

- Create your own session; pass `--browser` whenever more than one profile is
  connected. Another agent's session is not yours to reuse or delete.
- `state` persists across calls within a session: keep your page in it
  (`state.page = await context.newPage()`).
- `context.pages()` is the session's tab group. Tabs the human opens or signs
  in to inside that group are available to you; tabs outside it are not.
- Calls default to a 10 s timeout; pass `--timeout` for longer work.
- Sessions live in the relay and die with it.

## Stubborn pages

| Symptom | Approach |
|---|---|
| A link exists in the DOM but is hidden until a card or row is activated | Click the card to activate it, then `locator.dispatchEvent('click')` on the link |
| A custom dropdown ignores scripted clicks | Open it with the keyboard, or `page.screenshot()`, read the image, and `page.mouse.click(x, y)` by position |
| A document list shows only recent items | Look for filters, date ranges, "View more", or pagination before concluding an item is missing |
| State is unclear | `snapshot({ page })` first; `page.screenshot({ path: '/abs/path.png' })` and read the image when layout matters |
| The page loads its data from a JSON API | Call that API from the page with `page.evaluate(() => fetch(url, { credentials: 'include' }))`, page by page |

## Repeatable extraction as a repo script

When a site is read more than once, keep the procedure as a script in the
consuming repo (`scripts/<site>.js`) and run it with `-f`:

- The header comment states the command and that it never types credentials.
- It prints CSV (or JSON) on stdout; the caller strips the `[log]` prefix and
  redirects it to a file.
- It fails loudly: on a sign-in page, when no rows parse, and when a count or
  total the site reports does not match what was read.
- It bounds its loops (`PAGES_MAX`) and closes the pages it opened.
- Site-specific quirks live in that repo's docs, not in this skill.

## Isolating relays

One relay serves every connected profile, and its sessions are isolated from
each other in tabs and `state`, but not from Law 1 crashes. Separate relays:

```bash
PLAYWRITER_PORT=19990 \
PLAYWRITER_LOG_FILE_PATH=/path/relay-19990.log \
PLAYWRITER_CDP_LOG_FILE_PATH=/path/cdp-19990.jsonl \
  playwriter serve --host 127.0.0.1
PLAYWRITER_PORT=19990 playwriter session new --browser headless
```

- Start the relay with `serve` first: with no relay on `PLAYWRITER_PORT`, the
  CLI's auto-start still binds the default port 19988.
- Set both log paths, or relays truncate each other's logs on start.
- The extension's relay port is fixed when the extension is built. A relay on
  another port sees no Chrome profile unless a profile runs an extension build
  for that port; until then it serves `--browser headless` (or `--direct`) only.
- Do not restart or kill a relay you did not start; other agents' sessions live
  in it.
