import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// papercut.sh run for real under /bin/bash (bash 3.2 on macOS), outside any
// git repository, with SHARPENING_HOME in a scratch directory.
const SCRIPT = resolve(__dirname, "../plugins/agent-workflows/skills/papercuts/scripts/papercut.sh");

function host() {
  const home = mkdtempSync(join(tmpdir(), "papercuts-"));
  const run = (...args: string[]) => {
    const result = spawnSync("/bin/bash", [SCRIPT, ...args], {
      cwd: home,
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: home, SHARPENING_HOME: join(home, "sharpening") },
      encoding: "utf8",
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  };
  const queue = join(home, "sharpening", "papercuts.md");
  return { home, run, queue };
}

describe("papercut.sh", () => {
  it("appends each report as one line naming where it happened", () => {
    const h = host();
    expect(h.run("ssh hung\nused nohup").status).toBe(0);
    expect(h.run("-x flag is ignored").status).toBe(0);
    const lines = readFileSync(h.queue, "utf8").trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^- \d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ \S+ \S+: ssh hung used nohup$/);
    expect(lines[1]).toMatch(/: -x flag is ignored$/);
  });

  it("refuses an empty or overlong report without touching the queue", () => {
    const h = host();
    expect(h.run("").status).toBe(2);
    expect(h.run().status).toBe(2);
    expect(h.run("x".repeat(1001)).status).toBe(3);
    expect(existsSync(h.queue)).toBe(false);
  });

  it("takes the queue for triage and starts a fresh one", () => {
    const h = host();
    h.run("first");
    const taken = h.run("--take");
    expect(taken.status).toBe(0);
    const path = taken.stdout.trim();
    expect(readFileSync(path, "utf8")).toMatch(/: first\n$/);
    expect(existsSync(h.queue)).toBe(false);
    h.run("second");
    expect(readFileSync(h.queue, "utf8")).toMatch(/: second\n$/);
    expect(readdirSync(join(h.home, "sharpening", "triaged"))).toHaveLength(1);
  });

  it("takes nothing when nothing is queued", () => {
    const h = host();
    const taken = h.run("--take");
    expect(taken.status).toBe(0);
    expect(taken.stdout).toBe("");
  });
});
