import { execFile, spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PROCESS_TIMEOUT_MS } from "./process-timeout";

// The coordinator skill's scripts, run for real under /bin/bash (macOS ships
// bash 3.2 there; Linux ships bash 5), with no network and a stub sox. The
// stub answers `which` with SOX_STUB_SHELL, `ls` from ls.jsonl, and records
// what `send` would have typed.
const SCRIPTS = resolve(__dirname, "../plugins/agent-workflows/skills/coordinator/scripts");
const LEASE = join(SCRIPTS, "lease.sh");
const SEND = join(SCRIPTS, "send.sh");
const RETIRE = join(SCRIPTS, "retire.sh");

const FLEET = "# Fleet\n\n## Reservations\n| demo | unrelated | note |\n\n## Charters\n" +
  "| Charter | Charter file (host:path) | State |\n|---|---|---|\n" +
  "| demo | elsewhere:/handoffs/demo/charter.md | live (old prose) |\n" +
  "| other | other:/charter.md | parked |\n\n## Notes\nLeave these bytes alone.";

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
  function environment(who: Caller | null, now = "2026-10-04T20:00:00Z") {
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
    return env;
  }
  function run(script: string, args: string[], who: Caller | null, input = "", now = "2026-10-04T20:00:00Z") {
    // Keep the worker responsive to runner messages while a shell is working.
    return new Promise<{ status: number; stdout: string; stderr: string }>((resolve, reject) => {
      let inputError: NodeJS.ErrnoException | undefined;
      const child = execFile("/bin/bash", [script, ...args], {
        env: environment(who, now), encoding: "utf8", timeout: PROCESS_TIMEOUT_MS,
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

  it("lists every charter's lease with its holder and whether it is released", async () => {
    const f = fleet();
    mkdirSync(join(f.coordination, "alpha"));
    mkdirSync(join(f.coordination, "no-lease"));
    await f.run(LEASE, ["take", "alpha", "--reason", "Allen: become the coordinator"], TWO);
    await f.take(ONE);
    await f.run(LEASE, ["release", "demo", "--handoff", "/tmp/h.md"], ONE, "", "2026-10-04T21:00:00Z");
    const listed = await f.run(LEASE, ["list"], null);
    expect(listed.status).toBe(0);
    expect(listed.stdout).toBe(
      "alpha\t1\theld\ts-two\ts2.g1\t2026-10-04T20:00:00Z\n" +
        "demo\t1\treleased\ts-one\ts1.g1\t2026-10-04T20:00:00Z\n",
    );
  });

  it("says when there is no lease", async () => {
    const f = fleet();
    expect((await f.run(LEASE, ["show", "demo"], ONE)).status).toBe(3);
    expect((await f.run(LEASE, ["check", "demo"], ONE)).status).toBe(3);
  });

  it("writes only the registry State, accepts three words, and refuses prose", async () => {
    const f = fleet();
    const file = join(f.home, "fleet.md");
    await f.take(ONE);
    for (const original of [FLEET, FLEET + "\n", (FLEET + "\n").replaceAll("\n", "\r\n")]) {
      writeFileSync(file, original);
      for (const state of ["live", "blocked-on-human", "parked"]) {
        if (state === "parked") await f.run(LEASE, ["release", "demo", "--handoff", "/kept/handoff.md"], ONE);
        const args = ["state", "demo", "--state", state, "--fleet", file];
        expect((await f.run(LEASE, args, ONE)).status).toBe(0);
        expect(readFileSync(file, "utf8")).toBe(original.replace("live (old prose)", state));
        expect((await f.run(LEASE, args, ONE)).stdout).toBe(`demo\t${state}\tunchanged\n`);
      }
      await f.take(ONE);
    }
    const before = readFileSync(file);
    expect((await f.run(LEASE, ["state", "demo", "--state", "live (watch 2)", "--fleet", file], ONE)).status).toBe(2);
    expect(readFileSync(file)).toEqual(before);
  });

  it("requires the current holder and a released watch for parked", async () => {
    const f = fleet();
    const file = join(f.home, "fleet.md");
    writeFileSync(file, FLEET);
    await f.take(ONE);
    const args = (state: string) => ["state", "demo", "--state", state, "--fleet", file];
    expect((await f.run(LEASE, args("live"), TWO)).status).toBe(4);
    expect((await f.run(LEASE, args("parked"), ONE)).status).toBe(4);
    await f.run(LEASE, ["release", "demo", "--handoff", "/kept/handoff.md"], ONE);
    expect((await f.run(LEASE, args("live"), ONE)).status).toBe(4);
    await f.take(TWO);
    expect((await f.run(LEASE, args("parked"), ONE)).status).toBe(4);
    expect(readFileSync(file, "utf8")).toBe(FLEET);
  });

  it("leaves the file intact when another charter writes or the row is ambiguous", async () => {
    const f = fleet();
    const file = join(f.home, "fleet.md");
    await f.take(ONE);
    const args = ["state", "demo", "--state", "live", "--fleet", file];
    writeFileSync(file, FLEET);
    mkdirSync(`${file}.lock`);
    expect((await f.run(LEASE, args, ONE)).status).toBe(5);
    expect(readFileSync(file, "utf8")).toBe(FLEET);
    const otherFile = join(f.home, "ambiguous.md");
    for (const text of [FLEET.replace("| demo | elsewhere:", "| absent | elsewhere:"), FLEET + "\n## Charters\n| demo | duplicate | parked |\n"]) {
      writeFileSync(otherFile, text);
      expect((await f.run(LEASE, ["state", "demo", "--state", "live", "--fleet", otherFile], ONE)).status).toBe(2);
      expect(readFileSync(otherFile, "utf8")).toBe(text);
      expect(existsSync(`${otherFile}.lock`)).toBe(false);
    }
  });

  it("rejects a concurrent State writer with exit 5 and commits the first intact", async () => {
    const f = fleet();
    const file = join(f.home, "fleet.md");
    writeFileSync(file, FLEET);
    await f.take(ONE);
    mkdirSync(join(f.home, "bin"));
    const fifo = join(f.home, "continue");
    expect(spawnSync("mkfifo", [fifo]).status).toBe(0);
    const awk = join(f.home, "bin", "awk");
    // Pause scheduling after the locks; the parser itself remains the real awk.
    writeFileSync(awk, '#!/bin/bash\nprintf "lock held\\n" >&2\nread -r proceed < "$HOME/continue"\nexec /usr/bin/awk "$@"\n');
    chmodSync(awk, 0o755);
    const args = ["state", "demo", "--state", "blocked-on-human", "--fleet", file];
    const env = f.environment(ONE);
    const first = spawn("/bin/bash", [LEASE, ...args], { env: { ...env, PATH: `${join(f.home, "bin")}:${env.PATH}` } });
    const completed = new Promise<number | null>((resolve, reject) => {
      first.once("error", reject);
      first.once("close", resolve);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("State writer did not reach its lock")), 2000);
        first.stderr.once("data", () => { clearTimeout(timer); resolve(); });
      });
      expect((await f.run(LEASE, ["state", "demo", "--state", "live", "--fleet", file], ONE)).status).toBe(5);
      expect(readFileSync(file, "utf8")).toBe(FLEET);
      writeFileSync(fifo, "continue\n");
      expect(await completed).toBe(0);
      expect(readFileSync(file, "utf8")).toBe(FLEET.replace("live (old prose)", "blocked-on-human"));
      expect(existsSync(`${file}.lock`)).toBe(false);
      expect(existsSync(`${f.lease}.lock`)).toBe(false);
    } finally {
      if (first.exitCode === null) first.kill();
      await completed;
    }
  });
});

describe("retire.sh", () => {
  it("keeps the root and readable files when copying a kept file fails", async () => {
    const f = fleet();
    const root = join(f.home, "lane");
    const archive = join(f.home, "archive");
    mkdirSync(root);
    writeFileSync(join(root, "kept.txt"), "kept work\n");
    expect((await f.run(RETIRE, ["--root", root, "--delete", "--to", archive, "--keep", "missing.txt"], null)).status).toBe(3);
    expect(readFileSync(join(root, "kept.txt"), "utf8")).toBe("kept work\n");
  });

  it("copies a directory including hidden files and symlinks before deleting the root", async () => {
    const f = fleet();
    const root = join(f.home, "lane");
    const archive = join(f.home, "archive");
    mkdirSync(join(root, "empty"), { recursive: true });
    writeFileSync(join(root, ".kept.txt"), "kept work\n");
    symlinkSync(".kept.txt", join(root, "link"));
    expect((await f.run(RETIRE, ["--root", root, "--delete", "--to", archive, "--keep", "."], null)).status).toBe(0);
    expect(readFileSync(join(archive, "link"), "utf8")).toBe("kept work\n");
    expect(existsSync(join(archive, "empty"))).toBe(true);
    expect(existsSync(root)).toBe(false);
  });

  it("rejects deleting without opt-in and archiving inside the root or through a symlink", async () => {
    const f = fleet();
    const root = join(f.home, "lane");
    mkdirSync(root);
    writeFileSync(join(root, "kept.txt"), "kept work\n");
    symlinkSync(f.home, join(root, "outside"));
    expect((await f.run(RETIRE, ["--root", root], null)).status).toBe(2);
    expect((await f.run(RETIRE, ["--root", root, "--delete", "--to", join(root, "archive"), "--keep", "kept.txt"], null)).status).toBe(2);
    expect((await f.run(RETIRE, ["--root", root, "--delete", "--to", join(f.home, "archive"), "--keep", "outside/sox"], null)).status).toBe(2);
    expect(readFileSync(join(root, "kept.txt"), "utf8")).toBe("kept work\n");
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

  it("passes sox's failure through and logs it", async () => {
    const f = fleet(7);
    expect((await f.run(SEND, args("glyphs", "event"), null, "hello")).status).toBe(7);
    expect(readFileSync(join(f.coordination, "demo", "sent.log"), "utf8")).toMatch(/ failed event .* exit=7\n$/);
  });
});
