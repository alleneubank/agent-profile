import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";

const USAGE = "Usage: bun fetch.ts [--render] <url>";
const FETCH_TIMEOUT_MS = 30_000;
const RENDER_TIMEOUT_MS = 60_000;
// Time the page's scripts get to build the DOM before Chrome dumps it.
const RENDER_SCRIPT_BUDGET_MS = 10_000;
// Server-rendered pages carry thousands of characters of body text; pages built
// by client-side JavaScript carry almost none until a browser runs them.
const STATIC_TEXT_CHARS_MIN = 200;

const BROWSER_PATHS_MACOS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];
const BROWSER_COMMANDS = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];

const args = process.argv.slice(2);
const renderForced = args.includes("--render");
const positional = args.filter((arg) => arg !== "--render");
if (positional.length !== 1) {
  console.error(USAGE);
  process.exit(1);
}
const url = positional[0];

function visibleTextLength(html: string): number {
  const { document } = parseHTML(html);
  document.querySelectorAll("script,style,noscript,template").forEach((el) => el.remove());
  return (document.body?.textContent ?? "").replace(/\s+/g, " ").trim().length;
}

async function fetchStatic(target: string): Promise<string> {
  const response = await fetch(target, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ClaudeCode/1.0)" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`fetch failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function findBrowser(): string {
  const configured = process.env.CHROME_PATH;
  if (configured) {
    if (!existsSync(configured)) throw new Error(`CHROME_PATH does not exist: ${configured}`);
    return configured;
  }
  const found =
    BROWSER_PATHS_MACOS.find((path) => existsSync(path)) ??
    BROWSER_COMMANDS.map((command) => Bun.which(command)).find((path) => path !== null);
  if (!found) {
    throw new Error(
      "this page needs JavaScript and no Chrome or Chromium was found; " +
        "install one (dotfiles: ./install.sh --chrome) or set CHROME_PATH",
    );
  }
  return found;
}

// Runs the page's JavaScript in headless Chrome with a throwaway profile, so no
// signed-in browser state is read or changed.
async function fetchRendered(target: string): Promise<string> {
  const browser = findBrowser();
  const profile = mkdtempSync(join(tmpdir(), "web-fetch-chrome-"));
  try {
    const chrome = Bun.spawn(
      [
        browser,
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        `--user-data-dir=${profile}`,
        `--virtual-time-budget=${RENDER_SCRIPT_BUDGET_MS}`,
        "--dump-dom",
        target,
      ],
      { stdout: "pipe", stderr: "ignore", timeout: RENDER_TIMEOUT_MS },
    );
    const [dom, exitCode] = await Promise.all([new Response(chrome.stdout).text(), chrome.exited]);
    if (exitCode !== 0) {
      throw new Error(`headless Chrome exited with ${exitCode} (timeout ${RENDER_TIMEOUT_MS} ms)`);
    }
    return dom;
  } finally {
    rmSync(profile, { recursive: true });
  }
}

async function loadHtml(target: string): Promise<string> {
  if (renderForced) return fetchRendered(target);
  const html = await fetchStatic(target);
  if (visibleTextLength(html) >= STATIC_TEXT_CHARS_MIN) return html;
  console.error(`web-fetch: ${target} has no server-rendered text; rendering with headless Chrome`);
  return fetchRendered(target);
}

let html: string;
try {
  html = await loadHtml(url);
} catch (error) {
  console.error(`web-fetch: ${(error as Error).message}`);
  process.exit(1);
}

// Step 2: Parse DOM (step 1 loads the HTML above)
const { document } = parseHTML(html);

// Step 3: Find the content-rich element
const candidates = [
  ...document.querySelectorAll("article"),
  ...document.querySelectorAll("main"),
  ...document.querySelectorAll('[role="main"]'),
  ...document.querySelectorAll(".content"),
  ...document.querySelectorAll("#content"),
];

let contentEl: Element | null = null;
let maxLength = 0;

for (const el of candidates) {
  const len = el.textContent?.length || 0;
  if (len > maxLength) {
    maxLength = len;
    contentEl = el;
  }
}

if (!contentEl) {
  contentEl = document.body;
}

// Step 4: Clean up the content element before conversion
// Remove navigation elements
const removeSelectors = [
  "nav",
  "header",
  "footer",
  "script",
  "style",
  "noscript",
  '[role="navigation"]',
  ".sidebar",
  ".nav",
  ".menu",
  ".toc",
  '[aria-label="breadcrumb"]',
];

for (const selector of removeSelectors) {
  contentEl.querySelectorAll(selector).forEach((el) => el.remove());
}

// Step 5: Convert to Markdown with Turndown
const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

// Better code block handling
turndown.addRule("fencedCodeBlock", {
  filter: (node) => {
    return (
      node.nodeName === "PRE" &&
      node.firstChild &&
      node.firstChild.nodeName === "CODE"
    );
  },
  replacement: (content, node) => {
    const el = node as Element;
    const code = el.querySelector("code");
    const className = code?.className || "";
    const lang = className.match(/language-(\w+)/)?.[1] || "";
    const text = code?.textContent || "";
    return `\n\`\`\`${lang}\n${text}\n\`\`\`\n`;
  },
});

// Handle pre without code child
turndown.addRule("preBlock", {
  filter: (node) => {
    return (
      node.nodeName === "PRE" &&
      (!node.firstChild || node.firstChild.nodeName !== "CODE")
    );
  },
  replacement: (content, node) => {
    const text = (node as Element).textContent || "";
    return `\n\`\`\`\n${text}\n\`\`\`\n`;
  },
});

// Remove "Copy page" buttons and similar UI elements
turndown.addRule("removeButtons", {
  filter: (node) => {
    if (node.nodeName === "BUTTON") return true;
    const el = node as Element;
    if (el.getAttribute?.("aria-label")?.includes("Copy")) return true;
    return false;
  },
  replacement: () => "",
});

const markdown = turndown.turndown(contentEl.innerHTML);

// Step 6: Clean up the output
const cleaned = markdown
  // Remove Loading... placeholders
  .replace(/^Loading\.\.\.$/gm, "")
  // Remove Copy buttons
  .replace(/^Copy page$/gm, "")
  .replace(/^Copy$/gm, "")
  // Fix empty headings (## \n\nActual heading -> ## Actual heading)
  .replace(/^(#{1,6})\s*\n\n+([A-Z])/gm, "$1 $2")
  // Remove completely empty headings
  .replace(/^#{1,6}\s*$/gm, "")
  // Collapse multiple newlines
  .replace(/\n{3,}/g, "\n\n")
  .trim();

// Output with title
const title = document.title || "Untitled";
console.log(`# ${title}\n`);
console.log(cleaned);
