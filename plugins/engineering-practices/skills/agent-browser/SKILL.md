---
name: agent-browser
description: Use when driving a browser the agent owns through the agent-browser CLI — opening pages, clicking and filling by snapshot refs, screenshots, testing a web app, or extracting data from a rendered page.
---

# agent-browser (`agent-browser`)

agent-browser drives a Chrome/Chromium that the agent starts and owns, through
a background daemon, with accessibility snapshots that hand out `@eN` refs.

The CLI ships its own guides, matched to the installed version. Before the
first browser command, read the core guide, and load a specialized one only
when the task matches it:

```bash
agent-browser skills get core          # the workflow: sessions, snapshot/ref loop, waits
agent-browser skills get core --full   # adds the full command reference
agent-browser skills list              # electron, dogfood, slack, ... with one-line triggers
agent-browser skills get <name>
```

## Which browser tool

- Reading a public page as text: the `web-fetch` skill; no browser needed.
- A site that needs the human's own sign-in, cookies, or open tabs: the
  `playwriter` skill, which drives their real Chrome.
- Everything else that needs a rendered, interactive page (testing a web app
  or a local dev server, screenshots, form flows, scraping a JavaScript page):
  agent-browser.
- Reading or posting in Slack: the `slack` skill's API CLI, not agent-browser's
  `slack` browser guide.
