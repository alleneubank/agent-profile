import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The coordinator skill's scripts, run for real under /bin/bash (macOS ships
// bash 3.2 there; Linux ships bash 5), with no network and a stub sox.
const SCRIPTS = resolve(__dirname, "../plugins/agent-workflows/skills/coordinator/scripts");
const LEASE = join(SCRIPTS, "lease.sh");
const SEND = join(SCRIPTS, "send.sh");

function run(script: string, args: string[], options: { input?: string; env?: Record<string, string> } = {}) {
  const result = spawnSync("/bin/bash", [script, ...args], {
    input: options.input ?? "",
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: options.env?.HOME ?? tmpdir(), ...options.env },
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function scratch() {
  return mkdtempSync(join(tmpdir(), "coordinator-scripts-"));
}

const ONE = ["--session", "s-one", "--shell", "laptop/s1.g1"];
const TWO = ["--session", "s-two", "--shell", "laptop/s2.g1"];

function take(lease: string, who: string[], reason = "Allen: become the coordinator (2026-10-04T20:00Z)") {
  return run(LEASE, ["take", lease, "--charter", "demo", ...who, "--harness", "claude", "--reason", reason], {
    env: { LEASE_NOW: "2026-10-04T20:00:00Z" },
  });
}

describe("lease.sh", () => {
  it("takes watch 1, then a successor takes watch 2 and records the prior holder", () => {
    const lease = join(scratch(), "lease");
    expect(take(lease, ONE).status).toBe(0);
    expect(take(lease, TWO).status).toBe(0);
    const text = readFileSync(lease, "utf8");
    expect(text).toContain("watch=2\n");
    expect(text).toContain("session=s-two\n");
    expect(text).toContain("prior=s-one laptop/s1.g1 watch 1\n");
    expect(text).toContain("taken_at=2026-10-04T20:00:00Z\n");
  });

  it("lets only the current holder pass the gate", () => {
    const lease = join(scratch(), "lease");
    take(lease, ONE);
    take(lease, TWO);
    expect(run(LEASE, ["check", lease, ...TWO]).status).toBe(0);
    const stale = run(LEASE, ["check", lease, ...ONE]);
    expect(stale.status).toBe(4);
    expect(stale.stderr).toContain("held by s-two at laptop/s2.g1");
  });

  it("refuses a take without the human's reason", () => {
    const lease = join(scratch(), "lease");
    const result = run(LEASE, ["take", lease, "--charter", "demo", ...ONE, "--harness", "claude"]);
    expect(result.status).toBe(2);
    expect(existsSync(lease)).toBe(false);
  });

  it("refuses a value that would forge another key", () => {
    const lease = join(scratch(), "lease");
    expect(take(lease, ONE, "ok\nsession=intruder").status).toBe(2);
    expect(existsSync(lease)).toBe(false);
  });

  it("reports a busy lease instead of racing another writer", () => {
    const lease = join(scratch(), "lease");
    take(lease, ONE);
    mkdirSync(`${lease}.lock`);
    expect(take(lease, TWO).status).toBe(5);
    expect(readFileSync(lease, "utf8")).toContain("session=s-one\n");
  });

  it("releases only for the holder, and a released watch passes no gate", () => {
    const lease = join(scratch(), "lease");
    take(lease, ONE);
    expect(run(LEASE, ["release", lease, ...TWO, "--handoff", "/tmp/h.md"]).status).toBe(4);
    expect(run(LEASE, ["release", lease, ...ONE, "--handoff", "/tmp/h.md"], { env: { LEASE_NOW: "2026-10-04T21:00:00Z" } }).status).toBe(0);
    expect(readFileSync(lease, "utf8")).toContain("released_at=2026-10-04T21:00:00Z\n");
    expect(run(LEASE, ["check", lease, ...ONE]).status).toBe(4);
  });

  it("says when there is no lease", () => {
    expect(run(LEASE, ["show", join(scratch(), "missing")]).status).toBe(3);
  });
});

describe("send.sh", () => {
  // A stub sox that records its argv and stdin, so the test sees what would
  // have been typed into the target shell.
  function stubSox(dir: string, exitCode = 0) {
    const stub = join(dir, "sox");
    writeFileSync(stub, `#!/bin/bash\nprintf '%s\\n' "$*" > "${dir}/argv"\ncat > "${dir}/typed"\nexit ${exitCode}\n`);
    chmodSync(stub, 0o755);
    return stub;
  }

  const base = (dir: string, kind: string) => [
    "--from", "demo coordinator", "--to", "onyx/s3.g7", "--expect-fg", "claude", "--kind", kind, "--log", join(dir, "log.md"),
  ];

  it("types a headed line for the holder and records a receipt", () => {
    const dir = scratch();
    const lease = join(dir, "lease");
    take(lease, ONE);
    const result = run(SEND, [...base(dir, "relay"), "--lease", lease, ...ONE], {
      input: "Human decision (2026-10-04T20:05Z, via coordinator, addendum-1): ship it",
      env: { SOX_BIN: stubSox(dir), HOME: dir },
    });
    expect(result.status).toBe(0);
    expect(readFileSync(join(dir, "typed"), "utf8")).toBe(
      "[demo coordinator watch1 → onyx/s3.g7; relay] Human decision (2026-10-04T20:05Z, via coordinator, addendum-1): ship it",
    );
    expect(readFileSync(join(dir, "argv"), "utf8")).toContain("send onyx/s3.g7 --expect-fg claude --enter");
    expect(readFileSync(join(dir, "log.md"), "utf8")).toMatch(/ sent relay from demo coordinator watch1 to onyx\/s3\.g7 sha=[0-9a-f]{12}\n$/);
  });

  it("refuses a relay from a session that no longer holds the watch, and types nothing", () => {
    const dir = scratch();
    const lease = join(dir, "lease");
    take(lease, ONE);
    take(lease, TWO);
    const result = run(SEND, [...base(dir, "relay"), "--lease", lease, ...ONE], {
      input: "late answer",
      env: { SOX_BIN: stubSox(dir), HOME: dir },
    });
    expect(result.status).toBe(4);
    expect(existsSync(join(dir, "typed"))).toBe(false);
  });

  it("requires a lease for a relay but not for a lane's event", () => {
    const dir = scratch();
    const env = { SOX_BIN: stubSox(dir), HOME: dir };
    expect(run(SEND, base(dir, "relay"), { input: "x", env }).status).toBe(2);
    expect(run(SEND, base(dir, "event"), { input: "report.md is written", env }).status).toBe(0);
    expect(readFileSync(join(dir, "typed"), "utf8")).toBe("[demo coordinator → onyx/s3.g7; event] report.md is written");
  });

  it("refuses a multi-line message", () => {
    const dir = scratch();
    expect(run(SEND, base(dir, "event"), { input: "one\ntwo", env: { SOX_BIN: stubSox(dir), HOME: dir } }).status).toBe(2);
  });

  it("passes sox's failure through and logs it", () => {
    const dir = scratch();
    const result = run(SEND, base(dir, "event"), { input: "hello", env: { SOX_BIN: stubSox(dir, 7), HOME: dir } });
    expect(result.status).toBe(7);
    expect(readFileSync(join(dir, "log.md"), "utf8")).toMatch(/ failed event .* exit=7\n$/);
  });
});
