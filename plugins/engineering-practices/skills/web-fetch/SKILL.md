---
name: web-fetch
description: Use when fetching documentation, articles, or reference pages from HTTP or HTTPS URLs as clean Markdown.
---

# Web Content Fetching

Fetch web content in this order:
1. Prefer markdown-native endpoints (`content-type: text/markdown`)
2. Use selector-based HTML extraction for known sites
3. Use the bundled Bun fallback script when selectors fail or the page is
   built by JavaScript (empty or near-empty output); it renders such pages in
   headless Chrome automatically

## Prerequisites

Needs `curl`, `html2markdown` (selector extraction), and `bun` (fallback script).

Rendering JavaScript-built pages needs Chrome or Chromium: the macOS app,
`google-chrome`/`chromium` on PATH, or `CHROME_PATH`. Headless Linux hosts get
one from the dotfiles installer's `--chrome`.

Install Bun dependencies for the bundled script:

```bash
cd <path-to-this-skill-directory> && bun install
```

## Default Workflow

Use this as the default flow for any URL:

```bash
URL="<url>"
CONTENT_TYPE="$(curl -sIL "$URL" | awk -F': ' 'tolower($1)=="content-type"{print tolower($2)}' | tr -d '\r' | tail -1)"

if echo "$CONTENT_TYPE" | grep -q "markdown"; then
  curl -sL "$URL"
else
  curl -sL "$URL" \
    | html2markdown \
        --include-selector "article,main,[role=main]" \
        --exclude-selector "nav,header,footer,script,style"
fi
```

## Known Site Selectors

| Site | Include Selector | Exclude Selector |
|------|------------------|------------------|
| platform.claude.com | `#content-container` | - |
| docs.anthropic.com | `#content-container` | - |
| developer.mozilla.org | `article` | - |
| github.com (docs) | `article` | `nav,.sidebar` |
| Generic | `article,main,[role=main]` | `nav,header,footer,script,style` |

## Universal Fallback Script

When selectors produce poor or empty output, run the bundled parser:

```bash
bun <path-to-this-skill-directory>/fetch.ts "<url>"
bun <path-to-this-skill-directory>/fetch.ts --render "<url>"   # always render
```

A page with almost no server-rendered text (Apple's Human Interface Guidelines,
Material Design, most single-page apps) is re-fetched through headless Chrome
with a throwaway profile, which runs its scripts and dumps the finished DOM.
Use a driven browser (playwriter) only when the page needs a signed-in session
or interaction such as clicking tabs.

`fetch.ts` picks the largest of `article`, `main`, `[role=main]`, `.content`,
`#content` and strips navigation itself; it does not detect markdown-native
endpoints, so check the content type first.

## Troubleshooting

**Empty output with selectors**: the page may be markdown-native; check
`curl -sIL "<url>" | grep -i '^content-type:'`.

**`bun` or script deps missing**: run `bun install` from this skill directory.

**Client-rendered content**: If HTML only has "Loading..." placeholders or a "requires JavaScript" notice, run `fetch.ts`, which renders it; force rendering with `--render` when the page has some static text but the content is still missing.
