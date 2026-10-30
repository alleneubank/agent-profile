import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PROCESS_TIMEOUT_MS } from "./process-timeout";

// The fleet-watch skill's script, run for real under /bin/bash with a stub
// sox. The stub names the caller's shell from SOX_STUB_SHELL, replays
// watch.jsonl as the event stream, and records label calls.
const SCRIPT = resolve(__dirname, "../plugins/agent-workflows/skills/fleet-watch/scripts/fleet-watch.sh");
const OWN_SHELL = "s8.g1";
// A version-manager shim fails under the fixture's HOME, so PATH leads with
// the first jq that is not a shim.
const JQ_DIR = spawnSync("sh", ["-c", "which -a jq | grep -v /shims/ | head -n 1"], { encoding: "utf8" }).stdout.trim().replace(/\/jq$/, "");

function fleet() {
  const home = mkdtempSync(join(tmpdir(), "fleet-watch-script-"));
  const coordination = join(home, "handoffs");
  mkdirSync(join(coordination, "fleet-watch"), { recursive: true });
  const sox = join(home, "sox");
  writeFileSync(
    sox,
    `#!/bin/bash
case "$1" in
  which) printf '%s\\n' "$SOX_STUB_SHELL" ;;
  watch) cat "${home}/watch.jsonl" ;;
  label) shift; printf '%s\\n' "$*" >> "${home}/labels" ;;
esac
`,
  );
  chmodSync(sox, 0o755);
  const run = (...args: string[]) =>
    execFileSync("/bin/bash", [SCRIPT, ...args], {
      encoding: "utf8",
      timeout: PROCESS_TIMEOUT_MS,
      env: {
        PATH: `${JQ_DIR}:${process.env.PATH ?? "/usr/bin:/bin"}`,
        HOME: home,
        COORDINATION_HOME: coordination,
        SOX_BIN: sox,
        SOX_STUB_SHELL: OWN_SHELL,
        CLAUDE_CODE_SESSION_ID: "session-14",
        LEASE_NOW: "2026-10-30T03:00:00Z",
        FLEET_WATCH_DIR: join(home, "work"),
      },
    });
  const events = (rows: object[]) =>
    writeFileSync(join(home, "watch.jsonl"), rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  return { home, coordination, run, events };
}

describe("fleet-watch.sh", () => {
  it("takes the fleet-watch lease and labels its own shell", () => {
    const f = fleet();
    expect(f.run("take", "--reason", "the human: become the fleet watch")).toContain("watch=1");
    expect(readFileSync(join(f.coordination, "fleet-watch", "lease"), "utf8")).toContain(`shell=${OWN_SHELL}`);
    expect(readFileSync(join(f.home, "labels"), "utf8")).toBe(`${OWN_SHELL} role=fleet-watch charter=fleet-watch\n`);
  });

  it("reports what the watch acts on and never its own shell", () => {
    const f = fleet();
    f.events([
      { kind: "attention", target: OWN_SHELL, state: "done", previous: "working", labels: { role: "fleet-watch" } },
      { kind: "attention", target: OWN_SHELL, state: "blocked", previous: "done", labels: { role: "fleet-watch" } },
      { kind: "attention", target: "s11.g2", state: "blocked", previous: "working", reason: "Input required", labels: { charter: "sox-lanes" } },
      { kind: "attention", target: "s11.g2", state: "working", previous: "blocked", labels: { charter: "sox-lanes" } },
      { kind: "attention", target: "s6.g3", state: "gone", previous: "working", labels: { charter: "sox-lanes", lane: "impl-844" } },
      { kind: "attention", target: "s7.g4", state: "gone", previous: "none", labels: { charter: "sox-lanes", lane: "headless" } },
    ]);
    expect(f.run("watch").split("\n").filter(Boolean)).toEqual([
      "BLOCKED s11.g2 [sox-lanes] Input required",
      "ANSWERED s11.g2 [sox-lanes] now=working",
      "GONE MID-WORK s6.g3 [sox-lanes/impl-844] prev=working",
    ]);
  });
});
