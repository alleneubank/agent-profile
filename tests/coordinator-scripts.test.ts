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
  // The probe's ssh answers "cores load free-percent" from probe-<host>.
  const ssh = join(home, "ssh");
  writeFileSync(ssh, `#!/bin/bash\nhost=\${@: -2:1}\ncat "${home}/probe-$host" 2>/dev/null || exit 255\n`);
  chmodSync(ssh, 0o755);
  const caps = join(home, "fleet.json");
  const env = (who: Caller | null, now: string) => {
    const e: Record<string, string> = {
      PATH: `${JQ_DIR}:${process.env.PATH ?? "/usr/bin:/bin"}`,
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
  const launch = (host: string, lane: string) =>
    ["launch", "--fleet", caps, "--host", host, "--charter", "demo", "--lane", lane, "--launcher", "yolosonnet", "--", "/lanes/run.sh"];
  const cap = (host: string, n: number, ...more: string[]) =>
    run(LANE, ["cap", "--fleet", caps, "--host", host, "--cap", String(n), "--why", "provisional", ...more]);
  const slots = (now?: string) => run(LANE, ["slots", "--fleet", caps], null, now);
  const add = (row: Record<string, unknown>) =>
    writeFileSync(rows, readFileSync(rows, "utf8") + JSON.stringify({ kind: "shell", status: "live", command: "claude", attention: "working", labels: null, ...row }) + "\n");
  const drift = (...more: string[]) => run(LANE, ["drift", "--fleet", caps, ...more], null);
  const typed = () => (existsSync(join(home, "typed")) ? readFileSync(join(home, "typed"), "utf8").split("\n").filter(Boolean) : []);
  const shells = () => readFileSync(rows, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const launched = () => (existsSync(join(home, "launched")) ? readFileSync(join(home, "launched"), "utf8").split("\n").filter(Boolean) : []);
  await run(LEASE, ["take", "demo", "--reason", "the human: become the coordinator"]);
  return { home, caps, run, start, launch, cap, slots, shells, launched, add, drift, typed };
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
    expect((await f.slots()).stdout).toMatch(/^control\t1\t1\tfull\t\d+\.\d\t\d+\n$/);
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
      "ae-dev\t2\t6\tfree\t0.2\t60\nonyx\t-\t2\tunknown\t-\t-\npixelproton\t0\t0\tclosed\t0.8\t25\n",
    );
    expect((await f.slots("2026-10-12T16:00:00Z")).stdout).toContain("ae-dev\t2\t1\tover\t0.2\t60\n");
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
