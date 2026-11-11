import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
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
    expect(readFileSync(join(f.home, "labels"), "utf8")).toBe(
      `${OWN_SHELL} lease.fleet-watch=${realpathSync(f.coordination)}/fleet-watch/lease\n` +
      `${OWN_SHELL} role=fleet-watch charter=fleet-watch\n`,
    );
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

  it("prints each exception once when it starts and once when it clears", () => {
    const home = mkdtempSync(join(tmpdir(), "fleet-watch-exceptions-"));
    const coordination = join(home, "handoffs");
    const otherHome = join(home, "work-handoffs");
    const remoteHome = join(home, "remote-handoffs");
    const bin = join(home, "bin");
    const fleetDir = join(home, "fleet");
    const state = join(home, "state");
    mkdirSync(bin);
    mkdirSync(fleetDir);
    mkdirSync(join(home, "ssh"));
    const stub = (name: string, body: string) => {
      writeFileSync(join(bin, name), `#!/bin/bash\n${body}\n`);
      chmodSync(join(bin, name), 0o755);
    };
    stub("sox", `[ ! -e "${home}/sox-down" ] || exit 1\n[ "$1" = ls ] && cat "${home}/shells.jsonl"`);
    stub("agent-quota", `[ ! -e "${home}/quota-down" ] || exit 1\ncat "${home}/quota.jsonl"`);
    stub(
      "ssh",
      `cat > /dev/null
host=\${@: -2:1}
[ -f "${home}/ssh/$host" ] || { echo "ssh: connect to host $host: Connection refused" >&2; exit 255; }
cat "${home}/ssh/$host"`,
    );
    const lease = (root: string, charter: string, shell: string, state: string) => {
      mkdirSync(join(root, charter), { recursive: true });
      writeFileSync(
        join(root, charter, "lease"),
        `charter=${charter}\nwatch=3\nsession=session-${charter}\nshell=${shell}\nharness=claude\n` +
          `taken_at=2026-11-06T16:00:00Z\nstate=${state}\n`,
      );
    };
    lease(coordination, "fleet-watch", "s9.g9", "live");
    lease(coordination, "alpha", "s1.g1", "live");
    lease(coordination, "beta", "s2.g2", "live");
    lease(coordination, "gamma", "s3.g3", "blocked-on-human");
    lease(otherHome, "delta", "s4.g4", "live");
    lease(remoteHome, "epsilon", "s5.g5", "live");
    const here = hostname().split(".")[0];
    writeFileSync(
      join(fleetDir, "fleet.md"),
      "## Charters\n| Charter | Charter file (host:path) |\n|---|---|\n" +
        `| delta | ${here}:${otherHome}/delta/charter.md |\n` +
        `| epsilon | elsewhere:${remoteHome}/epsilon/charter.md |\n`,
    );
    writeFileSync(join(fleetDir, "fleet.json"), JSON.stringify({ version: 1, hosts: { down: { cap: 2 }, flaky: { cap: 2 }, full: { cap: 2 }, hover: { cap: 2 }, roomy: { cap: 0 } } }));
    const shells = (rows: object[]) =>
      writeFileSync(join(home, "shells.jsonl"), rows.map((row) => JSON.stringify({ kind: "shell", host: "localhost", status: "live", ...row })).join("\n") + "\n");
    const quota = (percent: number) =>
      writeFileSync(
        join(home, "quota.jsonl"),
        "not json\n" +
          JSON.stringify({ account: "acct-a", windows: [{ name: "weekly", used_percent: percent, resets_at: "2026-11-08T08:00:00Z" }] }) + "\n" +
          JSON.stringify({ account: "acct-b", windows: [{ name: "5h", used_percent: 99 }, { name: "weekly", used_percent: 50.0 }] }) + "\n" +
          JSON.stringify({ account: "acct-c", windows: [], error: "token expired" }) + "\n",
      );
    const host = (name: string, used: number | null) =>
      used === null ? spawnSync("rm", ["-f", join(home, "ssh", name)]) : writeFileSync(join(home, "ssh", name), `${used}\n`);
    const run = () =>
      execFileSync("/bin/bash", [SCRIPT, "exceptions", "--fleet", join(fleetDir, "fleet.json"), "--state", state, "--every", "1"], {
        encoding: "utf8",
        timeout: PROCESS_TIMEOUT_MS,
        env: { PATH: `${bin}:${JQ_DIR}:/usr/bin:/bin`, HOME: home, COORDINATION_HOME: coordination, SOX_BIN: join(bin, "sox") },
      })
        .split("\n")
        .filter(Boolean)
        .map((line) => line.replace(/^\d\d:\d\dZ /, ""));

    shells([
      { backing_id: "s9.g9" },
      { backing_id: "s2.g2", attention: "blocked", program: { records: [{ msg: "You've hit your weekly limit, resets Nov 8" }] } },
      { backing_id: "s4.g4", attention: "working" },
    ]);
    quota(95);
    host("full", 90);
    host("hover", 85);
    host("roomy", 40);
    mkdirSync(state);
    writeFileSync(join(state, ".down-since-down"), `${Math.floor(Date.now() / 1000) - 1000}\n`);
    expect(run()).toEqual([
      "COORDINATOR GONE alpha shell s1.g1 (lease state=live)",
      "COORDINATOR LIMIT-STOPPED beta shell s2.g2",
      "QUOTA acct-a weekly 95% (>= 90%), resets 2026-11-08T08:00:00Z",
      "HOST UNREACHABLE down by plain ssh for 15+ min",
      "DISK full 90% used (>= 85%)",
      "DISK hover 85% used (>= 85%)",
    ]);

    shells([
      { backing_id: "s9.g9" },
      { backing_id: "s1.g1", attention: "working" },
      { backing_id: "s2.g2", attention: "blocked", program: { records: [{ msg: "You've hit your weekly limit, resets Nov 8" }] } },
      { backing_id: "s4.g4", attention: "working" },
    ]);
    quota(98);
    host("full", 50);
    host("down", 30);
    host("hover", 84);
    expect(run()).toEqual([
      "CLEARED COORDINATOR GONE alpha shell s1.g1 (lease state=live)",
      "QUOTA acct-a weekly 98% (>= 97%), resets 2026-11-08T08:00:00Z",
      "CLEARED HOST UNREACHABLE down by plain ssh for 15+ min",
      "CLEARED DISK full 90% used (>= 85%)",
    ]);

    // hover is back at the line it never cleared from: only the quota changes print.
    quota(50);
    host("hover", 85);
    expect(run()).toEqual([
      "CLEARED QUOTA acct-a weekly 98% (>= 97%), resets 2026-11-08T08:00:00Z",
      "CLEARED QUOTA acct-a weekly 95% (>= 90%), resets 2026-11-08T08:00:00Z",
    ]);

    // A source that cannot be read is its own exception, and what its class
    // had reported stands until it answers again.
    writeFileSync(join(home, "sox-down"), "");
    writeFileSync(join(home, "quota-down"), "");
    expect(run()).toEqual([
      "SOURCE FAILED sox-ls: COORDINATOR exceptions are not being checked",
      "SOURCE FAILED agent-quota: QUOTA exceptions are not being checked",
    ]);
    spawnSync("rm", [join(home, "sox-down"), join(home, "quota-down")]);
    expect(run()).toEqual([
      "CLEARED SOURCE FAILED sox-ls: COORDINATOR exceptions are not being checked",
      "CLEARED SOURCE FAILED agent-quota: QUOTA exceptions are not being checked",
    ]);
  });
});
