import { execFile, spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PROCESS_TIMEOUT_MS } from "./process-timeout";

// The coordinator skill's scripts, run for real under /bin/bash (macOS ships
// bash 3.2 there; Linux ships bash 5), with no network and a stub sox. The
// stub answers `which` with SOX_STUB_SHELL, `ls` from ls.jsonl, keeps each
// backing's labels as sox does (one value per key), and records what `send`
// would have typed.
const SCRIPTS = resolve(__dirname, "../plugins/agent-workflows/skills/coordinator/scripts");
const LEASE = join(SCRIPTS, "lease.sh");
const SEND = join(SCRIPTS, "send.sh");
const RETIRE = join(SCRIPTS, "retire.sh");

type Caller = { session: string; shell: string };
const ONE: Caller = { session: "s-one", shell: "s1.g1" };
const TWO: Caller = { session: "s-two", shell: "s2.g1" };

function fleet(sendExit = 0) {
  const home = mkdtempSync(join(tmpdir(), "coordinator-scripts-"));
  const coordination = join(home, "handoffs");
  mkdirSync(join(coordination, "demo"), { recursive: true });
  // A charter whose only item waits on the human, so blocked-on-human is true.
  writeFileSync(join(coordination, "demo", "queue"), "gated\tforum\t#208\tplan approval\n");
  const sox = join(home, "sox");
  writeFileSync(
    sox,
    `#!/bin/bash
case "$1" in
  which) [ -n "$SOX_STUB_SHELL" ] || exit 1; printf '%s\\n' "$SOX_STUB_SHELL" ;;
  ls) grep -F "\\"host\\":\\"$2\\"" "${home}/ls.jsonl" ;;
  label)
    id=\${2#*/}; file="${home}/labels-$id"; shift 2
    if [ $# -eq 0 ]; then cat "$file" 2>/dev/null || echo "no labels on this backing" >&2; exit 0; fi
    for kv in "$@"; do
      touch "$file"
      while IFS= read -r line; do
        case "$line" in "\${kv%%=*}="*) ;; *) printf '%s\\n' "$line" ;; esac
      done < "$file" > "$file.tmp"
      printf '%s\\n' "$kv" >> "$file.tmp"
      mv "$file.tmp" "$file"
    done ;;
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
  function environment(who: Caller | null, now = "2026-10-04T20:00:00Z", coordinationHome = coordination) {
    const env: Record<string, string> = {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      HOME: home,
      COORDINATION_HOME: coordinationHome,
      SOX_BIN: sox,
      LEASE_NOW: now,
      SEND_HOSTNAME: "control",
    };
    if (who) {
      env.CLAUDE_CODE_SESSION_ID = who.session;
      env.SOX_STUB_SHELL = who.shell;
    }
    return env;
  }
  function run(script: string, args: string[], who: Caller | null, input = "", now = "2026-10-04T20:00:00Z", coordinationHome = coordination) {
    // Keep the worker responsive to runner messages while a shell is working.
    return new Promise<{ status: number; stdout: string; stderr: string }>((resolve, reject) => {
      let inputError: NodeJS.ErrnoException | undefined;
      const child = execFile("/bin/bash", [script, ...args], {
        env: environment(who, now, coordinationHome), encoding: "utf8", timeout: PROCESS_TIMEOUT_MS,
      }, (error, stdout, stderr) => {
        const status = error ? error.code : 0;
        // A rejected command can exit before reading stdin; its exit status is asserted.
        const rejectedInput = inputError?.code === "EPIPE" && status !== 0;
        if (typeof status !== "number") {
          reject(error);
        } else if (inputError && !rejectedInput) {
          reject(inputError);
        } else {
          resolve({ status, stdout, stderr });
        }
      });
      child.stdin?.on("error", (error: NodeJS.ErrnoException) => { inputError = error; });
      child.stdin?.end(input || undefined);
    });
  }
  const lease = join(coordination, "demo", "lease");
  const take = (who: Caller, reason = "Allen: become the coordinator (2026-10-04T20:00Z)") =>
    run(LEASE, ["take", "demo", "--reason", reason], who);
  const read = (name: string) => readFileSync(join(home, name), "utf8");
  return { home, coordination, lease, shells, environment, run, take, read, typed: () => existsSync(join(home, "typed")) };
}

describe("lease.sh", () => {
  it("takes watch 1 as this session and shell, then a successor takes watch 2", async () => {
    const f = fleet();
    expect((await f.take(ONE)).status).toBe(0);
    expect((await f.take(TWO)).status).toBe(0);
    const text = readFileSync(f.lease, "utf8");
    expect(text).toContain("charter=demo\n");
    expect(text).toContain("watch=2\n");
    expect(text).toContain("session=s-two\nshell=s2.g1\n");
    expect(text).toContain("prior=s-one s1.g1 watch 1\n");
    expect(text).toContain("taken_at=2026-10-04T20:00:00Z\n");
    expect(text).toContain("state=live\n");
  });

  it("lets only the current holder pass the gate", async () => {
    const f = fleet();
    await f.take(ONE);
    await f.take(TWO);
    expect((await f.run(LEASE, ["check", "demo"], TWO)).status).toBe(0);
    const stale = await f.run(LEASE, ["check", "demo"], ONE);
    expect(stale.status).toBe(4);
    expect(stale.stderr).toContain("held by s-two at s2.g1");
  });

  it("treats the same session in another shell as another caller", async () => {
    const f = fleet();
    await f.take(ONE);
    expect((await f.run(LEASE, ["check", "demo"], { session: "s-one", shell: "s9.g9" })).status).toBe(4);
  });

  it("refuses a caller outside Claude Code or outside a sox shell", async () => {
    const f = fleet();
    expect((await f.take(ONE)).status).toBe(0);
    const noSession = await f.run(LEASE, ["check", "demo"], null);
    expect(noSession.status).toBe(2);
    expect(noSession.stderr).toContain("CLAUDE_CODE_SESSION_ID");
    expect((await f.run(LEASE, ["check", "demo"], { session: "s-one", shell: "" })).status).toBe(2);
  });

  it("refuses a take without the human's reason, and a reason that would forge a key", async () => {
    const f = fleet();
    expect((await f.run(LEASE, ["take", "demo"], ONE)).status).toBe(2);
    expect((await f.take(ONE, "ok\nsession=intruder")).status).toBe(2);
    expect(existsSync(f.lease)).toBe(false);
  });

  it("refuses a charter name that is a path", async () => {
    const f = fleet();
    expect((await f.run(LEASE, ["show", "../demo"], ONE)).status).toBe(2);
    expect((await f.run(LEASE, ["show", "a/b"], ONE)).status).toBe(2);
  });

  it("reports a busy lease instead of racing another writer", async () => {
    const f = fleet();
    await f.take(ONE);
    mkdirSync(`${f.lease}.lock`);
    expect((await f.take(TWO)).status).toBe(5);
    expect(readFileSync(f.lease, "utf8")).toContain("session=s-one\n");
  });

  it("releases only for the holder, and a released watch passes no gate", async () => {
    const f = fleet();
    await f.take(ONE);
    expect((await f.run(LEASE, ["release", "demo", "--handoff", "/tmp/h.md"], TWO)).status).toBe(4);
    expect((await f.run(LEASE, ["release", "demo", "--handoff", "/tmp/h.md"], ONE, "", "2026-10-04T21:00:00Z")).status).toBe(0);
    expect(readFileSync(f.lease, "utf8")).toContain("released_at=2026-10-04T21:00:00Z\nhandoff=/tmp/h.md\n");
    expect((await f.run(LEASE, ["check", "demo"], ONE)).status).toBe(4);
  });

  it("lists every charter's lease with its holder, state, and whether the holding shell is alive", async () => {
    const f = fleet();
    f.shells([
      { host: "localhost", backing: TWO.shell, command: "claude", attention: "working" },
      { host: "localhost", backing: ONE.shell, command: "claude", attention: "done", status: "cold" },
    ]);
    mkdirSync(join(f.coordination, "alpha"));
    mkdirSync(join(f.coordination, "no-lease"));
    await f.run(LEASE, ["take", "alpha", "--reason", "Allen: become the coordinator"], TWO);
    await f.take(ONE);
    await f.run(LEASE, ["release", "demo", "--handoff", "/tmp/h.md"], ONE, "", "2026-10-04T21:00:00Z");
    const listed = await f.run(LEASE, ["list"], null);
    expect(listed.status).toBe(0);
    expect(listed.stdout).toBe(
      "alpha\t1\theld\tlive\talive\ts-two\ts2.g1\t2026-10-04T20:00:00Z\n" +
        "demo\t1\treleased\tlive\tgone\ts-one\ts1.g1\t2026-10-04T20:00:00Z\n",
    );
  });

  it("shows the lease with its shell's status, and says unknown when sox cannot be asked", async () => {
    const f = fleet();
    f.shells([{ host: "localhost", backing: ONE.shell, command: "claude", attention: "working" }]);
    await f.take(ONE);
    const shown = await f.run(LEASE, ["show", "demo"], null);
    expect(shown.status).toBe(0);
    expect(shown.stdout).toBe(readFileSync(f.lease, "utf8") + "shell_status=alive\n");
    // A lease from before take recorded a state, and a sox that fails (the stub finds no rows).
    writeFileSync(f.lease, readFileSync(f.lease, "utf8").replace("state=live\n", ""));
    f.shells([]);
    expect((await f.run(LEASE, ["show", "demo"], null)).stdout).toMatch(/\nshell_status=unknown\n$/);
    expect((await f.run(LEASE, ["list"], null)).stdout).toBe("demo\t1\theld\t-\tunknown\ts-one\ts1.g1\t2026-10-04T20:00:00Z\n");
  });

  it("says when there is no lease", async () => {
    const f = fleet();
    expect((await f.run(LEASE, ["show", "demo"], ONE)).status).toBe(3);
    expect((await f.run(LEASE, ["check", "demo"], ONE)).status).toBe(3);
  });

  it("writes the state in the lease, accepts three words, and refuses prose", async () => {
    const f = fleet();
    await f.take(ONE);
    for (const state of ["blocked-on-human", "live", "parked"]) {
      if (state === "parked") await f.run(LEASE, ["release", "demo", "--handoff", "/kept/handoff.md"], ONE);
      const args = ["state", "demo", "--state", state];
      expect((await f.run(LEASE, args, ONE)).stdout).toBe(`demo\t${state}\tchanged\n`);
      expect(readFileSync(f.lease, "utf8")).toContain(`state=${state}\n`);
      expect((await f.run(LEASE, args, ONE)).stdout).toBe(`demo\t${state}\tunchanged\n`);
    }
    const before = readFileSync(f.lease);
    expect((await f.run(LEASE, ["state", "demo", "--state", "live (watch 2)"], ONE)).status).toBe(2);
    expect((await f.run(LEASE, ["state", "demo", "--state", "parked", "--fleet", "/handoffs/fleet.md"], ONE)).status).toBe(2);
    expect(readFileSync(f.lease)).toEqual(before);
  });

  it("refuses blocked-on-human while the queue has a ready item, or when the queue is missing or malformed", async () => {
    const f = fleet();
    const queue = join(f.coordination, "demo", "queue");
    await f.take(ONE);
    const blocked = () => f.run(LEASE, ["state", "demo", "--state", "blocked-on-human"], ONE);

    rmSync(queue);
    expect((await blocked()).status).toBe(2);
    writeFileSync(queue, "# state\ttheme\titem\tnote\nready\ttraining\tdraft\nblocked\tforum\t#208\n");
    expect((await blocked()).stderr).toContain("line 3:");
    writeFileSync(queue, "# state\ttheme\titem\tnote\ngated\tforum\t#208\tplan approval\nready\ttraining\tdraft\n\ndone\tbugs\t#320\n");
    const refused = await blocked();
    expect(refused.status).toBe(6);
    expect(refused.stderr).toContain("1 ready item(s)");
    expect(readFileSync(f.lease, "utf8")).toContain("state=live\n");

    writeFileSync(queue, "gated\tforum\t#208\tplan approval\r\nrunning\ttraining\tdraft\r\n");
    expect((await blocked()).status).toBe(0);
    expect(readFileSync(f.lease, "utf8")).toContain("state=blocked-on-human\n");
    expect((await f.run(LEASE, ["state", "demo", "--state", "live"], ONE)).status).toBe(0);
  });

  it("requires the current holder and a released watch for parked", async () => {
    const f = fleet();
    await f.take(ONE);
    const args = (state: string) => ["state", "demo", "--state", state];
    expect((await f.run(LEASE, args("live"), TWO)).status).toBe(4);
    expect((await f.run(LEASE, args("parked"), ONE)).status).toBe(4);
    await f.run(LEASE, ["release", "demo", "--handoff", "/kept/handoff.md"], ONE);
    expect((await f.run(LEASE, args("live"), ONE)).status).toBe(4);
    await f.take(TWO);
    expect((await f.run(LEASE, args("parked"), ONE)).status).toBe(4);
    expect(readFileSync(f.lease, "utf8")).toContain("session=s-two\n");
    expect(readFileSync(f.lease, "utf8")).toContain("state=live\n");
  });

  it("rejects a state write while another writer holds the lease", async () => {
    const f = fleet();
    await f.take(ONE);
    mkdirSync(`${f.lease}.lock`);
    expect((await f.run(LEASE, ["state", "demo", "--state", "blocked-on-human"], ONE)).status).toBe(5);
    expect(readFileSync(f.lease, "utf8")).toContain("state=live\n");
  });
});

describe("retire.sh", () => {
  // A lane root under ~/Work and its lane directory under the coordination home.
  function lane() {
    const f = fleet();
    const root = join(f.home, "Work", "demo-l1");
    const kept = join(f.coordination, "demo", "l1", "kept");
    mkdirSync(root, { recursive: true });
    mkdirSync(join(f.coordination, "demo", "l1"));
    const retire = (...args: string[]) =>
      f.run(RETIRE, ["--root", root, "--delete", "--charter", "demo", "--lane", "l1", ...args], null);
    return { f, root, kept, retire };
  }

  it("moves evidence out of the lane root into the lane directory before deleting the root", async () => {
    const { root, kept, retire } = lane();
    mkdirSync(join(root, "evidence"));
    writeFileSync(join(root, "RECORD.md"), "# l1 record\n");
    writeFileSync(join(root, "evidence", "audit.tar.zst"), "sealed bundle\n");
    writeFileSync(join(root, "scratch.log"), "noise\n");
    expect((await retire("--keep", "RECORD.md", "--keep", "evidence")).status).toBe(0);
    expect(readFileSync(join(kept, "RECORD.md"), "utf8")).toBe("# l1 record\n");
    expect(readFileSync(join(kept, "evidence", "audit.tar.zst"), "utf8")).toBe("sealed bundle\n");
    expect(existsSync(join(kept, "scratch.log"))).toBe(false);
    expect(existsSync(root)).toBe(false);
  });

  it("copies a directory including hidden files and symlinks before deleting the root", async () => {
    const { root, kept, retire } = lane();
    mkdirSync(join(root, "empty"));
    writeFileSync(join(root, ".kept.txt"), "kept work\n");
    symlinkSync(".kept.txt", join(root, "link"));
    expect((await retire("--keep", ".")).status).toBe(0);
    expect(readFileSync(join(kept, "link"), "utf8")).toBe("kept work\n");
    expect(existsSync(join(kept, "empty"))).toBe(true);
    expect(existsSync(root)).toBe(false);
  });

  it("keeps the root when a kept path is missing or cannot be copied", async () => {
    const { root, retire } = lane();
    writeFileSync(join(root, "RECORD.md"), "# l1 record\n");
    writeFileSync(join(root, "sealed"), "unreadable\n");
    chmodSync(join(root, "sealed"), 0o000);
    expect((await retire("--keep", "RECORD.md", "--keep", "missing.txt")).status).toBe(2);
    expect((await retire("--keep", "RECORD.md", "--keep", "sealed")).status).toBe(3);
    chmodSync(join(root, "sealed"), 0o644);
    expect(readFileSync(join(root, "RECORD.md"), "utf8")).toBe("# l1 record\n");
  });

  it("rejects deleting without opt-in, keeping anywhere else, an unknown lane, and paths through a symlink", async () => {
    const { f, root, retire } = lane();
    writeFileSync(join(root, "RECORD.md"), "# l1 record\n");
    symlinkSync(f.home, join(root, "outside"));
    expect((await f.run(RETIRE, ["--root", root, "--charter", "demo", "--lane", "l1"], null)).status).toBe(2);
    expect((await f.run(RETIRE, ["--root", root, "--delete"], null)).status).toBe(2);
    expect((await f.run(RETIRE, ["--root", root, "--delete", "--charter", "demo", "--lane", "l9"], null)).status).toBe(2);
    expect((await f.run(RETIRE, ["--root", root, "--delete", "--charter", "demo", "--lane", "../demo"], null)).status).toBe(2);
    expect((await retire("--to", join(f.home, "Work", "archive"), "--keep", "RECORD.md")).status).toBe(2);
    expect((await retire("--keep", "outside/sox")).status).toBe(2);
    expect(readFileSync(join(root, "RECORD.md"), "utf8")).toBe("# l1 record\n");
  });
});

describe("send.sh", () => {
  const args = (role: string, kind: string, to = "onyx/s3.g7") => ["--charter", "demo", "--role", role, "--to", to, "--kind", kind];

  it("types a headed line from the holder, asserting the target's agent, and records a receipt", async () => {
    const f = fleet();
    await f.take(ONE);
    const result = await f.run(SEND, args("coordinator", "relay"), ONE, "Human decision (2026-10-04T20:05Z, via coordinator, addendum-1): ship it");
    expect(result.status).toBe(0);
    expect(f.read("typed")).toBe("[demo coordinator watch1 → onyx/s3.g7; relay] Human decision (2026-10-04T20:05Z, via coordinator, addendum-1): ship it");
    expect(f.read("argv")).toContain("send onyx/s3.g7 --expect-fg claude --enter");
    expect(readFileSync(join(f.coordination, "demo", "sent.log"), "utf8")).toMatch(
      / sent relay from demo coordinator watch1 to onyx\/s3\.g7 sha=[0-9a-f]{12}\n$/,
    );
  });

  it("refuses a relay from a session that no longer holds the watch, and types nothing", async () => {
    const f = fleet();
    await f.take(ONE);
    await f.take(TWO);
    expect((await f.run(SEND, args("coordinator", "relay"), ONE, "late answer")).status).toBe(4);
    expect(f.typed()).toBe(false);
  });

  it("lets a stale coordinator send evidence to the holder without the watch", async () => {
    const f = fleet();
    await f.take(ONE);
    await f.take(TWO);
    expect((await f.run(SEND, args("coordinator", "evidence"), ONE, "Allen answered here: see charter Decisions 21:10Z")).status).toBe(0);
    expect(f.read("typed")).toBe("[demo coordinator → onyx/s3.g7; evidence] Allen answered here: see charter Decisions 21:10Z");
  });

  it("lets a lane send an event without a lease but never relay", async () => {
    const f = fleet();
    expect((await f.run(SEND, args("glyphs", "relay"), null, "x")).status).toBe(2);
    expect((await f.run(SEND, args("glyphs", "event"), null, "report.md is written")).status).toBe(0);
    expect(f.read("typed")).toBe("[demo glyphs → onyx/s3.g7; event] report.md is written");
  });

  it("refuses a target that is a bare shell, missing, or cold, and types nothing", async () => {
    const f = fleet();
    const bare = await f.run(SEND, args("glyphs", "event", "onyx/s4.g2"), null, "hello");
    expect(bare.status).toBe(6);
    expect(bare.stderr).toContain("no agent has reported in onyx/s4.g2");
    expect((await f.run(SEND, args("glyphs", "event", "onyx/s8.g1"), null, "hello")).status).toBe(6);
    expect((await f.run(SEND, args("glyphs", "event", "onyx/s5.g1"), null, "hello")).status).toBe(6);
    expect(f.typed()).toBe(false);
  });

  it("matches a bare target only against this machine's shells", async () => {
    const f = fleet();
    f.shells([
      { host: "ae-dev", backing: "s3.g7", command: "codex", attention: "working" },
      { host: "localhost", backing: "s3.g7", command: "claude", attention: "done" },
    ]);
    expect((await f.run(SEND, args("glyphs", "event", "s3.g7"), null, "hello")).status).toBe(0);
    expect(f.read("argv")).toContain("send s3.g7 --expect-fg claude --enter");
  });

  it("reaches an agent that runs under a wrapper shell", async () => {
    const f = fleet();
    expect((await f.run(SEND, args("glyphs", "event", "onyx/s6.g3"), null, "hello")).status).toBe(0);
    expect(f.read("argv")).toContain("send onyx/s6.g3 --expect-fg bash --enter");
  });

  it("refuses a multi-line or oversized message", async () => {
    const f = fleet();
    expect((await f.run(SEND, args("glyphs", "event"), null, "one\ntwo")).status).toBe(2);
    expect((await f.run(SEND, args("glyphs", "event"), null, "x".repeat(2001))).status).toBe(2);
    expect(f.typed()).toBe(false);
  });

  it("refuses a coordinator stood down on this host until the sender passes --wake-stood-down", async () => {
    const f = fleet();
    f.shells([{ host: "localhost", backing: ONE.shell, command: "claude", attention: "done" }]);
    const toDemo = (...extra: string[]) => f.run(SEND, [...args("glyphs", "event", ONE.shell), ...extra], null, "report.md is written");
    await f.take(ONE);
    await f.run(LEASE, ["state", "demo", "--state", "blocked-on-human"], ONE);
    const blocked = await toDemo();
    expect(blocked.status).toBe(5);
    expect(blocked.stderr).toContain("demo coordinator, stood down (blocked-on-human)");
    await f.run(LEASE, ["release", "demo", "--handoff", "/kept/handoff.md"], ONE);
    await f.run(LEASE, ["state", "demo", "--state", "parked"], ONE);
    expect((await toDemo()).stderr).toContain("stood down (watch released at 2026-10-04T20:00:00Z)");
    expect(f.typed()).toBe(false);

    expect((await toDemo("--wake-stood-down")).status).toBe(0);
    expect(f.read("typed")).toBe(`[demo glyphs → ${ONE.shell}; event] report.md is written`);
    expect(readFileSync(join(f.coordination, "demo", "sent.log"), "utf8")).toMatch(/ sha=[0-9a-f]{12} wake-stood-down\n$/);
  });

  it("reaches a coordinator once a new watch is taken or its State is live again", async () => {
    const f = fleet();
    f.shells([{ host: "localhost", backing: ONE.shell, command: "claude", attention: "working" }]);
    await f.take(ONE);
    await f.run(LEASE, ["state", "demo", "--state", "blocked-on-human"], ONE);
    await f.run(LEASE, ["state", "demo", "--state", "live"], ONE);
    expect((await f.run(SEND, args("glyphs", "event", ONE.shell), null, "hello")).status).toBe(0);
    await f.run(LEASE, ["state", "demo", "--state", "blocked-on-human"], ONE);
    await f.take(ONE);
    expect(readFileSync(f.lease, "utf8")).toContain("state=live\n");
    expect((await f.run(SEND, args("glyphs", "event", ONE.shell), null, "hello")).status).toBe(0);
  });

  it("keeps a shell reachable for other senders while any charter it coordinates is live, and matches leases only on this host", async () => {
    const f = fleet();
    mkdirSync(join(f.coordination, "other"));
    f.shells([
      { host: "localhost", backing: ONE.shell, command: "claude", attention: "done" },
      { host: "onyx", backing: ONE.shell, command: "claude", attention: "done" },
    ]);
    await f.take(ONE);
    await f.run(LEASE, ["release", "demo", "--handoff", "/kept/handoff.md"], ONE);
    expect((await f.run(SEND, args("glyphs", "event", `onyx/${ONE.shell}`), null, "hello")).status).toBe(0);
    expect((await f.run(SEND, args("glyphs", "event", ONE.shell), null, "hello")).status).toBe(5);
    await f.run(LEASE, ["take", "other", "--reason", "Allen: coordinate other too"], ONE);
    const fromFleet = ["--charter", "fleet", "--role", "fleet-desk", "--to", ONE.shell, "--kind", "evidence"];
    expect((await f.run(SEND, fromFleet, null, "hello")).status).toBe(0);
  });

  it("refuses a stood-down coordinator whose lease lives under another coordination home", async () => {
    const f = fleet();
    const work = join(f.home, "work-handoffs");
    mkdirSync(join(work, "other"), { recursive: true });
    writeFileSync(join(work, "other", "queue"), "gated\tforum\t#9\tmerge approval\n");
    f.shells([{ host: "localhost", backing: ONE.shell, command: "claude", attention: "done" }]);
    const inWork = (args: string[]) => f.run(LEASE, args, ONE, "", undefined, work);
    expect((await inWork(["take", "other", "--reason", "the human: coordinate other from Work"])).status).toBe(0);
    expect((await inWork(["state", "other", "--state", "blocked-on-human"])).status).toBe(0);
    const toOther = () => f.run(SEND, ["--charter", "demo", "--role", "glyphs", "--to", ONE.shell, "--kind", "event"], null, "hello");
    const refused = await toOther();
    expect(refused.status).toBe(5);
    expect(refused.stderr).toContain("other coordinator, stood down (blocked-on-human)");
    expect(f.typed()).toBe(false);

    expect((await inWork(["state", "other", "--state", "live"])).status).toBe(0);
    expect((await toOther()).status).toBe(0);
  });

  it("judges a shared shell by the sender's own charter, fails closed on an unknown State, and records refusals", async () => {
    const f = fleet();
    mkdirSync(join(f.coordination, "other"));
    f.shells([{ host: "localhost", backing: ONE.shell, command: "claude", attention: "done" }]);
    await f.take(ONE);
    await f.run(LEASE, ["take", "other", "--reason", "Allen: coordinate other too"], ONE);
    await f.run(LEASE, ["state", "demo", "--state", "blocked-on-human"], ONE);
    const from = (charter: string) => f.run(SEND, ["--charter", charter, "--role", "glyphs", "--to", ONE.shell, "--kind", "event"], null, "hello");
    expect((await from("demo")).status).toBe(5);
    expect((await from("other")).status).toBe(0);
    expect((await from("fleet")).status).toBe(0);
    expect(readFileSync(join(f.coordination, "demo", "sent.log"), "utf8")).toMatch(/ refused event from demo glyphs to s1\.g1 sha=[0-9a-f]{12} stood-down\n$/);

    const other = join(f.coordination, "other", "lease");
    writeFileSync(other, readFileSync(other, "utf8").replace("state=live\n", "state=Paused\n"));
    expect((await from("other")).status).toBe(5);
    expect((await from("fleet")).status).toBe(5);
  });

  it("passes sox's failure through and logs it", async () => {
    const f = fleet(7);
    expect((await f.run(SEND, args("glyphs", "event"), null, "hello")).status).toBe(7);
    expect(readFileSync(join(f.coordination, "demo", "sent.log"), "utf8")).toMatch(/ failed event .* exit=7\n$/);
  });
});

const LANE = join(SCRIPTS, "lane.sh");
// lane.sh needs jq; a version-manager shim fails under the fixture's HOME, so
// the fixture's PATH leads with the first jq that is not a shim.
const JQ_DIR = spawnSync("sh", ["-c", "which -a jq | grep -v /shims/ | head -n 1"], { encoding: "utf8" }).stdout.trim().replace(/\/jq$/, "");

// A stub sox that keeps its shells in rows.jsonl: `new` adds an unlabeled row,
// `label` sets its labels, `kill` removes it, and `ls` answers for one host
// with a summary row, incomplete for a host listed in unreachable.
async function lanes() {
  const home = mkdtempSync(join(tmpdir(), "coordinator-lanes-"));
  const coordination = join(home, "handoffs");
  mkdirSync(join(coordination, "demo"), { recursive: true });
  const rows = join(home, "rows.jsonl");
  writeFileSync(rows, "");
  const sox = join(home, "sox");
  writeFileSync(
    sox,
    `#!/bin/bash
rows="${rows}"
case "$1" in
  which) printf '%s\\n' "$SOX_STUB_SHELL" ;;
  ls)
    if grep -qx "$2" "${home}/unreachable" 2>/dev/null; then
      printf '{"kind":"unreachable","host":"%s","complete":false}\\n{"kind":"summary","complete":false}\\n' "$2"
      exit 0
    fi
    jq -c --arg host "$2" 'select(.host == $host)' "$rows"
    echo '{"kind":"summary","complete":true}' ;;
  new)
    printf '%s\\n' "$*" >> "${home}/launched"
    id="s$$.g1"
    jq -cn --arg host "$2" --arg id "$id" '{kind:"shell",host:$host,backing_id:$id,status:"live",labels:null}' >> "$rows"
    if [ "$2" = localhost ]; then echo "$id"; else echo "$2/$id"; fi ;;
  label)
    [ -f "${home}/label-fails" ] && exit 1
    id=\${2#*/}; shift 2
    labels=$(for kv in "$@"; do jq -cn --arg k "\${kv%%=*}" --arg v "\${kv#*=}" '{($k):$v}'; done | jq -cs add)
    jq -c --arg id "$id" --argjson labels "$labels" 'if .backing_id == $id then .labels = $labels else . end' "$rows" > "$rows.tmp"
    mv "$rows.tmp" "$rows" ;;
  send) printf '%s\\n' "$*" >> "${home}/argv"; cat >> "${home}/typed"; echo >> "${home}/typed" ;;
  kill)
    printf '%s\\n' "$2" >> "${home}/killed"
    jq -c --arg id "\${2#*/}" 'select(.backing_id != $id)' "$rows" > "$rows.tmp"
    mv "$rows.tmp" "$rows" ;;
esac
`,
  );
  chmodSync(sox, 0o755);
  // The probe's ssh answers "cores load free-percent" from probe-<host>, and
  // runs a claude-pretrust command line as that host would, from its home.
  const ssh = join(home, "ssh");
  writeFileSync(
    ssh,
    `#!/bin/bash
host=\${@: -2:1}
case "\${@: -1}" in
  claude-pretrust*) cd "${home}" && PRETRUST_HOST=$host exec bash -c "\${@: -1}" ;;
esac
cat "${home}/probe-$host" 2>/dev/null || exit 255
`,
  );
  chmodSync(ssh, 0o755);
  // claude-pretrust records where it ran and with what, and exits with
  // pretrust-exit-<host> (0 when absent).
  const bin = join(home, "bin");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "claude-pretrust"),
    `#!/bin/bash
where=\${PRETRUST_HOST:-localhost}
printf '%s %s %s\\n' "$where" "$PWD" "$*" >> "${home}/pretrusted"
echo "[REFUSED] stub refusal for $where"
exit "$(cat "${home}/pretrust-exit-$where" 2>/dev/null || echo 0)"
`,
  );
  chmodSync(join(bin, "claude-pretrust"), 0o755);
  const caps = join(home, "fleet.json");
  const env = (who: Caller | null, now: string) => {
    const e: Record<string, string> = {
      PATH: `${bin}:${JQ_DIR}:${process.env.PATH ?? "/usr/bin:/bin"}`,
      HOME: home,
      COORDINATION_HOME: coordination,
      SOX_BIN: sox,
      LEASE_NOW: now,
      LANE_NOW: now,
      LANE_HOSTNAME: "control",
      LANE_LOCK_WAIT_SECONDS: "2",
      LANE_SSH: ssh,
    };
    if (who) {
      e.CLAUDE_CODE_SESSION_ID = who.session;
      e.SOX_STUB_SHELL = who.shell;
    }
    return e;
  };
  function run(script: string, args: string[], who: Caller | null = ONE, now = "2026-10-12T02:00:00Z") {
    // Keep the worker responsive to runner messages while a shell is working.
    return new Promise<{ status: number; stdout: string; stderr: string }>((resolve, reject) => {
      execFile("/bin/bash", [script, ...args], {
        env: env(who, now), encoding: "utf8", timeout: PROCESS_TIMEOUT_MS,
      }, (error, stdout, stderr) => {
        const status = error ? error.code : 0;
        if (typeof status === "number") {
          resolve({ status, stdout, stderr });
        } else {
          reject(error);
        }
      });
    });
  }
  function start(args: string[]): Promise<{ status: number | null; stdout: string }> {
    return new Promise((done) => {
      const child = spawn("/bin/bash", [LANE, ...args], { env: env(ONE, "2026-10-12T02:00:00Z"), timeout: PROCESS_TIMEOUT_MS });
      let stdout = "";
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.on("close", (status) => done({ status, stdout }));
    });
  }
  const launch = (host: string, lane: string, ...pretrust: string[]) => [
    "launch", "--fleet", caps, "--host", host, "--charter", "demo", "--lane", lane, "--launcher", "yolosonnet",
    ...(pretrust.length ? pretrust : ["--pretrust", ".", "--workdir", `Work/repo.worktrees/demo-${lane}`]),
    "--", "/lanes/run.sh",
  ];
  const pretrusted = () => (existsSync(join(home, "pretrusted")) ? readFileSync(join(home, "pretrusted"), "utf8").split("\n").filter(Boolean) : []);
  const cap = (host: string, n: number, ...more: string[]) =>
    run(LANE, ["cap", "--fleet", caps, "--host", host, "--cap", String(n), "--why", "provisional", ...more]);
  const reserve = (resource: string, owners: string, until: string, ...more: string[]) =>
    run(LANE, ["reserve", "--fleet", caps, "--resource", resource, "--owners", owners, "--until", until, "--why", "the human: A/B window", ...more]);
  const as = (charter: string, args: string[]) => args.map((a, i) => (args[i - 1] === "--charter" ? charter : a));
  const slots = (now?: string) => run(LANE, ["slots", "--fleet", caps], null, now);
  const add = (row: Record<string, unknown>) =>
    writeFileSync(rows, readFileSync(rows, "utf8") + JSON.stringify({ kind: "shell", status: "live", command: "claude", attention: "working", labels: null, ...row }) + "\n");
  const drift = (...more: string[]) => run(LANE, ["drift", "--fleet", caps, ...more], null);
  const typed = () => (existsSync(join(home, "typed")) ? readFileSync(join(home, "typed"), "utf8").split("\n").filter(Boolean) : []);
  const shells = () => readFileSync(rows, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const launched = () => (existsSync(join(home, "launched")) ? readFileSync(join(home, "launched"), "utf8").split("\n").filter(Boolean) : []);
  await run(LEASE, ["take", "demo", "--reason", "the human: become the coordinator"]);
  mkdirSync(join(coordination, "boss"));
  await run(LEASE, ["take", "boss", "--reason", "the human: become the coordinator"], TWO);
  return { home, caps, run, start, launch, reserve, as, cap, slots, shells, launched, pretrusted, add, drift, typed };
}

describe("lane.sh", () => {
  it("launches a labeled lane while the host is under its cap, then refuses at the cap", async () => {
    const f = await lanes();
    expect((await f.cap("onyx", 1)).status).toBe(0);
    const first = await f.run(LANE, f.launch("onyx", "glyphs"));
    expect(first.status).toBe(0);
    expect(first.stdout).toMatch(/^onyx\ts\d+\.g1\t1\t1\n$/);
    expect(f.shells()[0].labels).toEqual({ owner: "demo", charter: "demo", lane: "glyphs", launcher: "yolosonnet" });
    expect(f.launched()).toEqual(["new onyx --no-attach --exec -- /lanes/run.sh"]);

    const second = await f.run(LANE, f.launch("onyx", "fonts"));
    expect(second.status).toBe(7);
    expect(second.stderr).toContain("onyx 1/1 full");
    expect(f.launched()).toHaveLength(1);
  });

  it("gives two simultaneous launches for one slot to exactly one of them", async () => {
    const f = await lanes();
    await f.cap("onyx", 1);
    const results = await Promise.all([f.start(f.launch("onyx", "a")), f.start(f.launch("onyx", "b"))]);
    // The loser is refused at the cap, or as busy when the winner holds the
    // lock past the fixture's short wait; either way it launches nothing.
    const [winner, loser] = results.map((r) => r.status).sort();
    expect(winner).toBe(0);
    expect([5, 7]).toContain(loser);
    expect(f.shells()).toHaveLength(1);
  });

  it("refuses a host with no cap, and one sox cannot count", async () => {
    const f = await lanes();
    const uncapped = await f.run(LANE, f.launch("onyx", "glyphs"));
    expect(uncapped.status).toBe(6);
    expect(uncapped.stderr).toContain("onyx has no cap");
    await f.cap("ae-dev", 4);
    writeFileSync(join(f.home, "unreachable"), "ae-dev\n");
    expect((await f.run(LANE, f.launch("ae-dev", "glyphs"))).status).toBe(6);
    expect(f.launched()).toEqual([]);
  });

  it("refuses a second shell for a lane that already has one", async () => {
    const f = await lanes();
    await f.cap("onyx", 4);
    await f.run(LANE, f.launch("onyx", "glyphs"));
    const again = await f.run(LANE, f.launch("onyx", "glyphs"));
    expect(again.status).toBe(8);
    expect(f.shells()).toHaveLength(1);
  });

  it("kills a shell it could not label, so no uncounted lane runs", async () => {
    const f = await lanes();
    await f.cap("onyx", 4);
    writeFileSync(join(f.home, "label-fails"), "");
    const result = await f.run(LANE, f.launch("onyx", "glyphs"));
    expect(result.status).toBe(9);
    expect(f.shells()).toEqual([]);
  });

  it("launches only for the holder of the charter's watch", async () => {
    const f = await lanes();
    await f.cap("onyx", 4);
    expect((await f.run(LANE, f.launch("onyx", "glyphs"), TWO)).status).toBe(4);
    expect(f.launched()).toEqual([]);
  });

  it("waits a bounded time for a held fleet lock, then reports its holder", async () => {
    const f = await lanes();
    await f.cap("onyx", 4);
    mkdirSync(`${f.caps}.lock`);
    writeFileSync(`${f.caps}.lock/holder`, "elsewhere pid 1");
    const result = await f.run(LANE, f.launch("onyx", "glyphs"));
    expect(result.status).toBe(5);
    expect(result.stderr).toContain("elsewhere pid 1");
    expect(f.launched()).toEqual([]);
  });

  it("counts the caller's own host as localhost", async () => {
    const f = await lanes();
    await f.cap("control", 1);
    expect((await f.run(LANE, f.launch("control", "glyphs"))).status).toBe(0);
    expect(f.launched()).toEqual(["new localhost --no-attach --exec -- /lanes/run.sh"]);
    expect((await f.slots()).stdout).toMatch(/^control\t1\t1\tfull\t\d+\.\d\t\d+\t-\t-\n$/);
  });

  it("reports each host's slots, and a temporary cap lapses to its after value", async () => {
    const f = await lanes();
    await f.cap("onyx", 2);
    await f.cap("pixelproton", 0);
    await f.cap("ae-dev", 6, "--until", "2026-10-12T16:00:00Z", "--after", "1");
    await f.run(LANE, f.launch("ae-dev", "a"));
    await f.run(LANE, f.launch("ae-dev", "b"));
    writeFileSync(join(f.home, "unreachable"), "onyx\n");
    writeFileSync(join(f.home, "probe-ae-dev"), "32 8.0 60\n");
    writeFileSync(join(f.home, "probe-pixelproton"), "16 12.0 25\n");
    expect((await f.slots()).stdout).toBe(
      "ae-dev\t2\t6\tfree\t0.2\t60\t-\t-\nonyx\t-\t2\tunknown\t-\t-\t-\t-\npixelproton\t0\t0\tclosed\t0.8\t25\t-\t-\n",
    );
    expect((await f.slots("2026-10-12T16:00:00Z")).stdout).toContain("ae-dev\t2\t1\tover\t0.2\t60\t-\t-\n");
  });

  it("answers a Claude agent's startup dialogs on the lane host, from its home, before launching", async () => {
    const f = await lanes();
    await f.cap("onyx", 4);
    await f.cap("control", 4);
    const send = ["--pretrust", ".claude-send", "--workdir", "Work/repo.worktrees/demo-glyphs"];
    expect((await f.run(LANE, f.launch("onyx", "glyphs", ...send))).status).toBe(0);
    expect((await f.run(LANE, f.launch("control", "fonts"))).status).toBe(0);
    expect(f.pretrusted()).toEqual([
      `onyx ${f.home} --fix --config-dir .claude-send Work/repo.worktrees/demo-glyphs`,
      `localhost ${f.home} --fix --config-dir . Work/repo.worktrees/demo-fonts`,
    ]);
    expect(f.launched()).toHaveLength(2);
  });

  it("launches nothing when claude-pretrust refuses the directory or fails", async () => {
    const f = await lanes();
    await f.cap("onyx", 4);
    writeFileSync(join(f.home, "pretrust-exit-onyx"), "3");
    const refused = await f.run(LANE, f.launch("onyx", "glyphs"));
    expect(refused.status).toBe(10);
    expect(refused.stderr).toContain("stub refusal for onyx");
    expect(refused.stderr).toContain("the human answers its startup dialogs");
    writeFileSync(join(f.home, "pretrust-exit-onyx"), "1");
    expect((await f.run(LANE, f.launch("onyx", "glyphs"))).status).toBe(11);
    expect(f.launched()).toEqual([]);
    expect(f.shells()).toEqual([]);
  });

  it("requires every launch to state --pretrust, and a Claude one its --workdir", async () => {
    const f = await lanes();
    await f.cap("onyx", 4);
    const bare = ["launch", "--fleet", f.caps, "--host", "onyx", "--charter", "demo", "--lane", "glyphs", "--launcher", "pigrok", "--", "/lanes/run.sh"];
    expect((await f.run(LANE, bare)).status).toBe(2);
    expect((await f.run(LANE, f.launch("onyx", "glyphs", "--pretrust", ".claude-send"))).status).toBe(2);
    expect((await f.run(LANE, f.launch("onyx", "glyphs", "--pretrust", "~/.claude-send", "--workdir", "Work/x"))).status).toBe(2);
    expect(f.launched()).toEqual([]);
    expect((await f.run(LANE, f.launch("onyx", "glyphs", "--pretrust", "none"))).status).toBe(0);
    expect(f.pretrusted()).toEqual([]);
    expect(f.launched()).toHaveLength(1);
  });

  it("rejects caps it cannot hold", async () => {
    const f = await lanes();
    expect((await f.cap("onyx", 65)).status).toBe(2);
    expect((await f.cap("onyx", 2, "--until", "tonight", "--after", "1")).status).toBe(2);
    expect((await f.cap("onyx", 2, "--until", "2026-10-12T16:00:00Z")).status).toBe(2);
    expect((await f.run(LANE, ["cap", "--fleet", f.caps, "--host", "onyx", "--cap", "2", "--why", "a\nb"])).status).toBe(2);
    expect(existsSync(f.caps)).toBe(false);
  });
});

describe("lane.sh reservations", () => {
  it("refuses another charter's launch on a reserved host, naming the reservation, and admits its owner", async () => {
    const f = await lanes();
    await f.cap("pixelproton", 4);
    expect((await f.reserve("pixelproton", "demo", "2026-10-12T04:00:00Z")).status).toBe(0);
    const refused = await f.run(LANE, f.as("boss", f.launch("pixelproton", "sims")), TWO);
    expect(refused.status).toBe(12);
    expect(refused.stderr).toContain(
      `lane.sh: pixelproton is reserved for demo until 2026-10-12T04:00:00Z (reservation in ${f.caps}: the human: A/B window; set 2026-10-12T02:00:00Z): queue the lane\n`,
    );
    expect(f.launched()).toEqual([]);
    expect((await f.run(LANE, f.launch("pixelproton", "ab"))).status).toBe(0);
    expect(f.launched()).toHaveLength(1);
    // The owner still takes the cap's slots like anyone else.
    await f.cap("pixelproton", 1);
    expect((await f.run(LANE, f.launch("pixelproton", "ab2"))).status).toBe(7);
  });

  it("admits every named owner, and no one else", async () => {
    const f = await lanes();
    await f.cap("aem5", 4);
    await f.reserve("aem5", "recall,demo", "2026-10-12T04:00:00Z");
    expect((await f.run(LANE, f.launch("aem5", "rollout"))).status).toBe(0);
    expect((await f.run(LANE, f.as("boss", f.launch("aem5", "sims")), TWO)).status).toBe(12);
  });

  it("holds nothing once its until passes", async () => {
    const f = await lanes();
    await f.cap("pixelproton", 4);
    await f.reserve("pixelproton", "demo", "2026-10-12T04:00:00Z");
    const after = await f.run(LANE, f.as("boss", f.launch("pixelproton", "sims")), TWO, "2026-10-12T04:00:00Z");
    expect(after.status).toBe(0);
    expect((await f.slots("2026-10-12T04:00:00Z")).stdout).toMatch(/^pixelproton\t1\t4\tfree\t-\t-\t-\t-\n$/);
  });

  it("launches as before from a caps file with no reservations key", async () => {
    const f = await lanes();
    writeFileSync(f.caps, JSON.stringify({ version: 1, hosts: { onyx: { cap: 1, why: "old file", set_at: "2026-10-01T00:00:00Z" } } }));
    expect((await f.run(LANE, f.as("boss", f.launch("onyx", "glyphs")), TWO)).status).toBe(0);
    expect((await f.run(LANE, ["reservations", "--fleet", f.caps], null)).stdout).toBe("");
    expect((await f.slots()).stdout).toMatch(/^onyx\t1\t1\tfull\t-\t-\t-\t-\n$/);
  });

  it("shows holding reservations in slots and reservations, and release removes one", async () => {
    const f = await lanes();
    await f.cap("pixelproton", 4);
    await f.reserve("pixelproton", "demo", "2026-10-12T04:00:00Z");
    await f.reserve("iphone-15-a1b2", "boss", "2026-10-12T03:00:00Z");
    expect((await f.slots()).stdout).toMatch(/^pixelproton\t0\t4\tfree\t-\t-\tdemo\t2026-10-12T04:00:00Z\n$/);
    expect((await f.run(LANE, ["reservations", "--fleet", f.caps], null)).stdout).toBe(
      "iphone-15-a1b2\tboss\t2026-10-12T03:00:00Z\tthe human: A/B window\t2026-10-12T02:00:00Z\n" +
        "pixelproton\tdemo\t2026-10-12T04:00:00Z\tthe human: A/B window\t2026-10-12T02:00:00Z\n",
    );
    const released = await f.run(LANE, ["release", "--fleet", f.caps, "--resource", "pixelproton"], null);
    expect(released.status).toBe(0);
    expect(JSON.parse(released.stdout)).toEqual({
      released: "pixelproton",
      was: { owners: ["demo"], why: "the human: A/B window", set_at: "2026-10-12T02:00:00Z", until: "2026-10-12T04:00:00Z" },
    });
    expect((await f.run(LANE, f.as("boss", f.launch("pixelproton", "sims")), TWO)).status).toBe(0);
    // Releasing again is a no-op that says nothing was held.
    expect(JSON.parse((await f.run(LANE, ["release", "--fleet", f.caps, "--resource", "pixelproton"], null)).stdout).was).toBeNull();
  });

  it("drops lapsed reservations on the next write", async () => {
    const f = await lanes();
    await f.reserve("pixelproton", "demo", "2026-10-12T03:00:00Z");
    await f.run(LANE, ["reserve", "--fleet", f.caps, "--resource", "onyx", "--owners", "demo", "--until", "2026-10-12T05:00:00Z", "--why", "w"], null, "2026-10-12T04:00:00Z");
    expect(Object.keys(JSON.parse(readFileSync(f.caps, "utf8")).reservations)).toEqual(["onyx"]);
  });

  it("rejects reservations it cannot hold", async () => {
    const f = await lanes();
    expect((await f.reserve("pixelproton", "demo", "tonight")).status).toBe(2);
    expect((await f.reserve("pixelproton", "demo", "2026-10-12T01:00:00Z")).status).toBe(2);
    expect((await f.reserve("pixelproton", "demo", "2026-10-19T02:00:01Z")).status).toBe(2);
    expect((await f.reserve("pixelproton", "demo,", "2026-10-12T04:00:00Z")).status).toBe(2);
    expect((await f.reserve("pixelproton", "a,b,c,d,e,f,g,h,i", "2026-10-12T04:00:00Z")).status).toBe(2);
    expect((await f.reserve("pixel proton", "demo", "2026-10-12T04:00:00Z")).status).toBe(2);
    expect((await f.run(LANE, ["reserve", "--fleet", f.caps, "--resource", "onyx", "--owners", "demo", "--until", "2026-10-12T04:00:00Z"], null)).status).toBe(2);
    expect(existsSync(f.caps)).toBe(false);
  });
});

describe("lane.sh drift", () => {
  const coordinator = { host: "localhost", backing_id: "s9.g1", attention: "done", labels: { role: "coordinator", charter: "demo", state: "live" } };
  const lane = (backing: string, charter = "demo") => ({ host: "onyx", backing_id: backing, labels: { lane: backing, charter } });

  it("reports an over-cap host once, as evidence to each live coordinator with a lane there, and its clearing", async () => {
    const f = await lanes();
    await f.cap("onyx", 1);
    writeFileSync(join(f.home, "probe-onyx"), "16 3.0 40\n");
    f.add(coordinator);
    f.add({ ...coordinator, backing_id: "s8.g1", labels: { role: "coordinator", charter: "other", state: "live" } });
    f.add({ ...coordinator, backing_id: "s7.g1", labels: { role: "coordinator", charter: "third", state: "live" } });
    f.add(lane("a"));
    f.add(lane("b", "other"));

    const first = await f.drift();
    expect(first.status).toBe(0);
    expect(first.stdout).toBe("new\tover\tonyx\t2/1 lanes\n");
    expect(f.typed().sort()).toEqual([
      "[demo fleet-check → s9.g1; evidence] Fleet drift: over onyx, 2/1 lanes. lane.sh slots shows every host.",
      "[other fleet-check → s8.g1; evidence] Fleet drift: over onyx, 2/1 lanes. lane.sh slots shows every host.",
    ]);

    expect((await f.drift()).stdout).toBe("");
    expect(f.typed()).toHaveLength(2);

    await f.cap("onyx", 2);
    expect((await f.drift()).stdout).toBe("cleared\tover\tonyx\n");
  });

  it("reports load only on its second consecutive check", async () => {
    const f = await lanes();
    await f.cap("onyx", 4);
    writeFileSync(join(f.home, "probe-onyx"), "16 880.0 3\n");
    expect((await f.drift()).stdout).toBe("");
    expect((await f.drift()).stdout).toBe("new\tload\tonyx\t55.0 per core\nnew\tmemory\tonyx\t3% free\n");
    const recorded = readFileSync(join(f.home, "handoffs", "fleet-drift.txt"), "utf8");
    expect(recorded).toContain("load\tonyx\t55.0 per core\t2026-10-12T02:00:00Z\treported\n");
  });

  it("lists a blocked coordinator without sending it anything, an unlabeled agent under ~/Work as a bypass, and an unreachable host as unknown", async () => {
    const f = await lanes();
    await f.cap("onyx", 4);
    await f.cap("ae-dev", 4);
    writeFileSync(join(f.home, "probe-onyx"), "16 3.0 40\n");
    writeFileSync(join(f.home, "unreachable"), "ae-dev\n");
    f.add({ ...coordinator, labels: { role: "coordinator", charter: "demo", state: "blocked-on-human" } });
    f.add({ ...coordinator, backing_id: "s8.g1", labels: { role: "coordinator", charter: "other", state: "live" } });
    f.add(lane("a", "other"));
    f.add({ host: "onyx", backing_id: "s5.g1", cwd: "/home/ae/Work/alleneubank/x" });
    f.add({ host: "onyx", backing_id: "s6.g1", cwd: "/home/ae/alleneubank/x" });
    f.add({ host: "onyx", backing_id: "s4.g1", cwd: "/home/ae/Work/y", attention: null });

    const lines = (await f.drift()).stdout.split("\n").filter(Boolean).sort();
    expect(lines).toEqual([
      "new\tblocked\tdemo\tcontrol/s9.g1",
      "new\tbypass\tonyx\ts5.g1 /home/ae/Work/alleneubank/x",
      "new\tunknown\tae-dev\tprobe failed",
      "new\tunknown\tae-dev\tsox could not count its shells",
    ]);
    expect(f.typed()).toEqual([]);
  });

  it("repeats only with a bounded interval and a stop time", async () => {
    const f = await lanes();
    await f.cap("onyx", 4);
    expect((await f.drift("--every", "300")).status).toBe(2);
    expect((await f.drift("--every", "5", "--stop-at", "2026-10-12T16:00:00Z")).status).toBe(2);
    expect((await f.drift("--every", "300", "--stop-at", "2026-10-12T01:00:00Z")).status).toBe(0);
  });
});
