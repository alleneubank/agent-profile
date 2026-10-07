import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The coordinator skill's scripts, run for real under /bin/bash (macOS ships
// bash 3.2 there; Linux ships bash 5), with no network and a stub sox. The
// stub answers `which` with SOX_STUB_SHELL, `ls` from ls.jsonl, and records
// what `send` would have typed.
const SCRIPTS = resolve(__dirname, "../plugins/agent-workflows/skills/coordinator/scripts");
const LEASE = join(SCRIPTS, "lease.sh");
const SEND = join(SCRIPTS, "send.sh");

type Caller = { session: string; shell: string };
const ONE: Caller = { session: "s-one", shell: "s1.g1" };
const TWO: Caller = { session: "s-two", shell: "s2.g1" };

function fleet(sendExit = 0) {
  const home = mkdtempSync(join(tmpdir(), "coordinator-scripts-"));
  const coordination = join(home, "handoffs");
  mkdirSync(join(coordination, "demo"), { recursive: true });
  const sox = join(home, "sox");
  writeFileSync(
    sox,
    `#!/bin/bash
case "$1" in
  which) [ -n "$SOX_STUB_SHELL" ] || exit 1; printf '%s\\n' "$SOX_STUB_SHELL" ;;
  ls) grep -F "\\"host\\":\\"$2\\"" "${home}/ls.jsonl" ;;
  send) printf '%s\\n' "$*" > "${home}/argv"; cat > "${home}/typed"; exit ${sendExit} ;;
esac
`,
  );
  chmodSync(sox, 0o755);
  shells([
    { host: "onyx", backing: "s3.g7", command: "claude", attention: "working" },
    { host: "onyx", backing: "s4.g2", command: "zsh", attention: null },
    { host: "onyx", backing: "s5.g1", command: "claude", attention: "done", status: "cold" },
    { host: "onyx", backing: "s6.g3", command: "bash", attention: "working" },
  ]);
  function shells(rows: { host: string; backing: string; command: string | null; attention: string | null; status?: string }[]) {
    writeFileSync(
      join(home, "ls.jsonl"),
      rows.map((r) => JSON.stringify({ kind: "shell", backing_id: r.backing, host: r.host, status: r.status ?? "live", command: r.command, attention: r.attention })).join("\n") + "\n",
    );
  }
  function run(script: string, args: string[], who: Caller | null, input = "", now = "2026-10-04T20:00:00Z") {
    const env: Record<string, string> = {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      HOME: home,
      COORDINATION_HOME: coordination,
      SOX_BIN: sox,
      LEASE_NOW: now,
    };
    if (who) {
      env.CLAUDE_CODE_SESSION_ID = who.session;
      env.SOX_STUB_SHELL = who.shell;
    }
    const result = spawnSync("/bin/bash", [script, ...args], { input, env, encoding: "utf8" });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  }
  const lease = join(coordination, "demo", "lease");
  const take = (who: Caller, reason = "Allen: become the coordinator (2026-10-04T20:00Z)") =>
    run(LEASE, ["take", "demo", "--reason", reason], who);
  const read = (name: string) => readFileSync(join(home, name), "utf8");
  return { home, coordination, lease, shells, run, take, read, typed: () => existsSync(join(home, "typed")) };
}

describe("lease.sh", () => {
  it("takes watch 1 as this session and shell, then a successor takes watch 2", () => {
    const f = fleet();
    expect(f.take(ONE).status).toBe(0);
    expect(f.take(TWO).status).toBe(0);
    const text = readFileSync(f.lease, "utf8");
    expect(text).toContain("charter=demo\n");
    expect(text).toContain("watch=2\n");
    expect(text).toContain("session=s-two\nshell=s2.g1\n");
    expect(text).toContain("prior=s-one s1.g1 watch 1\n");
    expect(text).toContain("taken_at=2026-10-04T20:00:00Z\n");
  });

  it("lets only the current holder pass the gate", () => {
    const f = fleet();
    f.take(ONE);
    f.take(TWO);
    expect(f.run(LEASE, ["check", "demo"], TWO).status).toBe(0);
    const stale = f.run(LEASE, ["check", "demo"], ONE);
    expect(stale.status).toBe(4);
    expect(stale.stderr).toContain("held by s-two at s2.g1");
  });

  it("treats the same session in another shell as another caller", () => {
    const f = fleet();
    f.take(ONE);
    expect(f.run(LEASE, ["check", "demo"], { session: "s-one", shell: "s9.g9" }).status).toBe(4);
  });

  it("refuses a caller outside Claude Code or outside a sox shell", () => {
    const f = fleet();
    expect(f.take(ONE).status).toBe(0);
    const noSession = f.run(LEASE, ["check", "demo"], null);
    expect(noSession.status).toBe(2);
    expect(noSession.stderr).toContain("CLAUDE_CODE_SESSION_ID");
    expect(f.run(LEASE, ["check", "demo"], { session: "s-one", shell: "" }).status).toBe(2);
  });

  it("refuses a take without the human's reason, and a reason that would forge a key", () => {
    const f = fleet();
    expect(f.run(LEASE, ["take", "demo"], ONE).status).toBe(2);
    expect(f.take(ONE, "ok\nsession=intruder").status).toBe(2);
    expect(existsSync(f.lease)).toBe(false);
  });

  it("refuses a charter name that is a path", () => {
    const f = fleet();
    expect(f.run(LEASE, ["show", "../demo"], ONE).status).toBe(2);
    expect(f.run(LEASE, ["show", "a/b"], ONE).status).toBe(2);
  });

  it("reports a busy lease instead of racing another writer", () => {
    const f = fleet();
    f.take(ONE);
    mkdirSync(`${f.lease}.lock`);
    expect(f.take(TWO).status).toBe(5);
    expect(readFileSync(f.lease, "utf8")).toContain("session=s-one\n");
  });

  it("releases only for the holder, and a released watch passes no gate", () => {
    const f = fleet();
    f.take(ONE);
    expect(f.run(LEASE, ["release", "demo", "--handoff", "/tmp/h.md"], TWO).status).toBe(4);
    expect(f.run(LEASE, ["release", "demo", "--handoff", "/tmp/h.md"], ONE, "", "2026-10-04T21:00:00Z").status).toBe(0);
    expect(readFileSync(f.lease, "utf8")).toContain("released_at=2026-10-04T21:00:00Z\nhandoff=/tmp/h.md\n");
    expect(f.run(LEASE, ["check", "demo"], ONE).status).toBe(4);
  });

  it("says when there is no lease", () => {
    const f = fleet();
    expect(f.run(LEASE, ["show", "demo"], ONE).status).toBe(3);
    expect(f.run(LEASE, ["check", "demo"], ONE).status).toBe(3);
  });
});

describe("send.sh", () => {
  const args = (role: string, kind: string, to = "onyx/s3.g7") => ["--charter", "demo", "--role", role, "--to", to, "--kind", kind];

  it("types a headed line from the holder, asserting the target's agent, and records a receipt", () => {
    const f = fleet();
    f.take(ONE);
    const result = f.run(SEND, args("coordinator", "relay"), ONE, "Human decision (2026-10-04T20:05Z, via coordinator, addendum-1): ship it");
    expect(result.status).toBe(0);
    expect(f.read("typed")).toBe("[demo coordinator watch1 → onyx/s3.g7; relay] Human decision (2026-10-04T20:05Z, via coordinator, addendum-1): ship it");
    expect(f.read("argv")).toContain("send onyx/s3.g7 --expect-fg claude --enter");
    expect(readFileSync(join(f.coordination, "demo", "sent.log"), "utf8")).toMatch(
      / sent relay from demo coordinator watch1 to onyx\/s3\.g7 sha=[0-9a-f]{12}\n$/,
    );
  });

  it("refuses a relay from a session that no longer holds the watch, and types nothing", () => {
    const f = fleet();
    f.take(ONE);
    f.take(TWO);
    expect(f.run(SEND, args("coordinator", "relay"), ONE, "late answer").status).toBe(4);
    expect(f.typed()).toBe(false);
  });

  it("lets a stale coordinator send evidence to the holder without the watch", () => {
    const f = fleet();
    f.take(ONE);
    f.take(TWO);
    expect(f.run(SEND, args("coordinator", "evidence"), ONE, "Allen answered here: see charter Decisions 21:10Z").status).toBe(0);
    expect(f.read("typed")).toBe("[demo coordinator → onyx/s3.g7; evidence] Allen answered here: see charter Decisions 21:10Z");
  });

  it("lets a lane send an event without a lease but never relay", () => {
    const f = fleet();
    expect(f.run(SEND, args("glyphs", "relay"), null, "x").status).toBe(2);
    expect(f.run(SEND, args("glyphs", "event"), null, "report.md is written").status).toBe(0);
    expect(f.read("typed")).toBe("[demo glyphs → onyx/s3.g7; event] report.md is written");
  });

  it("refuses a target that is a bare shell, missing, or cold, and types nothing", () => {
    const f = fleet();
    const bare = f.run(SEND, args("glyphs", "event", "onyx/s4.g2"), null, "hello");
    expect(bare.status).toBe(6);
    expect(bare.stderr).toContain("no agent has reported in onyx/s4.g2");
    expect(f.run(SEND, args("glyphs", "event", "onyx/s8.g1"), null, "hello").status).toBe(6);
    expect(f.run(SEND, args("glyphs", "event", "onyx/s5.g1"), null, "hello").status).toBe(6);
    expect(f.typed()).toBe(false);
  });

  it("matches a bare target only against this machine's shells", () => {
    const f = fleet();
    f.shells([
      { host: "ae-dev", backing: "s3.g7", command: "codex", attention: "working" },
      { host: "localhost", backing: "s3.g7", command: "claude", attention: "done" },
    ]);
    expect(f.run(SEND, args("glyphs", "event", "s3.g7"), null, "hello").status).toBe(0);
    expect(f.read("argv")).toContain("send s3.g7 --expect-fg claude --enter");
  });

  it("reaches an agent that runs under a wrapper shell", () => {
    const f = fleet();
    expect(f.run(SEND, args("glyphs", "event", "onyx/s6.g3"), null, "hello").status).toBe(0);
    expect(f.read("argv")).toContain("send onyx/s6.g3 --expect-fg bash --enter");
  });

  it("refuses a multi-line or oversized message", () => {
    const f = fleet();
    expect(f.run(SEND, args("glyphs", "event"), null, "one\ntwo").status).toBe(2);
    expect(f.run(SEND, args("glyphs", "event"), null, "x".repeat(2001)).status).toBe(2);
    expect(f.typed()).toBe(false);
  });

  it("passes sox's failure through and logs it", () => {
    const f = fleet(7);
    expect(f.run(SEND, args("glyphs", "event"), null, "hello").status).toBe(7);
    expect(readFileSync(join(f.coordination, "demo", "sent.log"), "utf8")).toMatch(/ failed event .* exit=7\n$/);
  });
});
