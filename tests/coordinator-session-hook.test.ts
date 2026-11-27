import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The coordinator-session hook, run for real under /bin/bash (bash 3.2 on
// macOS) with no network and a stub sox whose presence answer comes from
// STUB_PRESENCE: here, away, error (the command exists but fails), hang, or
// missing (a sox without the presence command).
const HOOK = resolve(__dirname, "../plugins/agent-workflows/hooks/coordinator-session.sh");

const COORDINATOR = "a1b2c3d4-0000-4000-8000-000000000001";
const LANE = "a1b2c3d4-0000-4000-8000-000000000002";
const PARKED = "a1b2c3d4-0000-4000-8000-000000000003";

function fixture() {
  const home = mkdtempSync(join(tmpdir(), "coordinator-session-"));
  const coordination = join(home, "handoffs");
  for (const [charter, lease] of [
    ["demo", `charter=demo\nwatch=4\nsession=${COORDINATOR}\nshell=s1.g1\nstate=live\n`],
    ["old", `charter=old\nwatch=2\nsession=${PARKED}\nshell=s2.g1\nreleased_at=2026-11-01T00:00:00Z\nstate=parked\n`],
  ]) {
    mkdirSync(join(coordination, charter), { recursive: true });
    writeFileSync(join(coordination, charter, "lease"), lease);
  }
  const sox = join(home, "sox");
  writeFileSync(
    sox,
    `#!/bin/bash
case "$STUB_PRESENCE:$1 $2" in
  missing:*) echo "sox: unknown command '$1'" >&2; exit 1 ;;
  *:"help presence") exit 0 ;;
  here:"presence --json") echo '{"state":"here","since":"2026-11-27T20:00:00Z"}' ;;
  nested:"presence --json") echo '{"state":"away","devices":[{"state":"here"}]}' ;;
  away:"presence --json") echo '{"state":"away"}'; exit 1 ;;
  error:"presence --json") echo "presence: daemon unreachable" >&2; exit 3 ;;
  hang:"presence --json") exec sleep 30 ;;
  *) exit 1 ;;
esac
`,
  );
  chmodSync(sox, 0o755);

  function run(
    event: string,
    input: string,
    options: { presence?: string; sox?: string; quietHours?: string; clock?: string } = {},
  ) {
    // A fixed wall clock: a date that answers the hook's +%H:%M and nothing else.
    let path = process.env.PATH ?? "/usr/bin:/bin";
    if (options.clock !== undefined) {
      const bin = mkdtempSync(join(home, "clock-"));
      writeFileSync(join(bin, "date"), `#!/bin/bash\n[[ "$1" == "+%H:%M" ]] && echo "${options.clock}" || exec /bin/date "$@"\n`);
      chmodSync(join(bin, "date"), 0o755);
      path = `${bin}:${path}`;
    }
    const env: Record<string, string> = {
      PATH: path,
      HOME: home,
      COORDINATION_HOME: coordination,
      SOX_BIN: options.sox ?? sox,
      STUB_PRESENCE: options.presence ?? "missing",
    };
    if (options.quietHours !== undefined) env.COORDINATOR_QUIET_HOURS = options.quietHours;
    const started = Date.now();
    const result = spawnSync("/bin/bash", [HOOK, event], { input, env, encoding: "utf8", timeout: 10_000 });
    return { status: result.status, stdout: result.stdout, elapsedMs: Date.now() - started };
  }

  return { coordination, run, missingSox: join(home, "no-such-sox") };
}

function question(session: string, text = "Tea or coffee?") {
  return JSON.stringify({
    session_id: session,
    hook_event_name: "PreToolUse",
    tool_name: "AskUserQuestion",
    tool_input: { questions: [{ question: text, header: "Drink", options: [{ label: "Tea" }, { label: "Coffee" }] }] },
  });
}

function denial(stdout: string) {
  const output = JSON.parse(stdout) as {
    hookSpecificOutput: { hookEventName: string; permissionDecision: string; permissionDecisionReason: string };
  };
  expect(output.hookSpecificOutput.hookEventName).toBe("PreToolUse");
  expect(output.hookSpecificOutput.permissionDecision).toBe("deny");
  return output.hookSpecificOutput.permissionDecisionReason;
}

// HH:MM in UTC, offset from now by whole hours, so windows hold for the run.
function utcClock(offsetHours: number) {
  const date = new Date(Date.now() + offsetHours * 3_600_000);
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}
const INSIDE = `${utcClock(-2)}-${utcClock(2)} UTC`;
const OUTSIDE = `${utcClock(3)}-${utcClock(5)} UTC`;

describe("coordinator-session hook: the question widget", () => {
  it("denies a coordinator's question while sox presence says away, pointing at its log's waiting list", () => {
    const { coordination, run } = fixture();
    const result = run("PreToolUse", question(COORDINATOR), { presence: "away" });
    expect(result.status).toBe(0);
    const reason = denial(result.stdout);
    expect(reason).toContain("Waiting on the human");
    expect(reason).toContain(join(coordination, "demo", "log.md"));
    expect(reason).toContain("continue with other ready work");
    expect(reason).toContain("Only if nothing else in the charter can proceed");
    expect(reason).toContain("[nothing else ready: <why>]");
  });

  it("opens a question that states the exception while away, and records it in the charter log", () => {
    const { coordination, run, missingSox } = fixture();
    const log = join(coordination, "demo", "log.md");
    const stated = "[nothing else ready: every lane waits on the deploy go] Deploy now?";
    for (const options of [{ presence: "away" }, { presence: "error" }, { sox: missingSox, quietHours: INSIDE }]) {
      expect(run("PreToolUse", question(COORDINATOR, stated), options)).toMatchObject({ status: 0, stdout: "" });
    }
    const entries = readFileSync(log, "utf8").split("\n").filter((line) => line.startsWith("- "));
    expect(entries).toHaveLength(3);
    for (const entry of entries) {
      expect(entry).toContain(COORDINATOR);
      expect(entry).toContain("every lane waits on the deploy go");
    }
    expect(entries[0]).toContain("sox presence says the human is away");
    expect(entries[2]).toContain("COORDINATOR_QUIET_HOURS");
  });

  it("denies an exception without a reason or not at the start of the question, and records nothing", () => {
    const { coordination, run } = fixture();
    for (const text of ["[nothing else ready: ] Deploy?", "[nothing else ready:    ] Deploy?", "Deploy? [nothing else ready: buried]"]) {
      denial(run("PreToolUse", question(COORDINATOR, text), { presence: "away" }).stdout);
    }
    expect(existsSync(join(coordination, "demo", "log.md"))).toBe(false);
  });

  it("allows a coordinator's question while sox presence says here, even inside quiet hours", () => {
    const { run } = fixture();
    const result = run("PreToolUse", question(COORDINATOR), { presence: "here", quietHours: INSIDE });
    expect(result).toMatchObject({ status: 0, stdout: "" });
  });

  it("leaves sessions without an unreleased lease alone, exception or not", () => {
    const { coordination, run } = fixture();
    for (const session of [LANE, PARKED]) {
      for (const text of ["Tea?", "[nothing else ready: stuck] Tea?"]) {
        expect(run("PreToolUse", question(session, text), { presence: "away", quietHours: INSIDE })).toMatchObject({
          status: 0,
          stdout: "",
        });
      }
    }
    expect(existsSync(join(coordination, "demo", "log.md"))).toBe(false);
    expect(existsSync(join(coordination, "old", "log.md"))).toBe(false);
  });

  it("denies when sox has a presence command that fails or hangs, within the hook's timeout", () => {
    const { run } = fixture();
    for (const presence of ["error", "hang"]) {
      const result = run("PreToolUse", question(COORDINATOR), { presence });
      expect(result.status).toBe(0);
      expect(denial(result.stdout)).toContain("could not be read");
      expect(result.elapsedMs).toBeLessThan(5_000);
    }
  });

  it("falls back to quiet hours when sox or its presence command is missing", () => {
    const { run, missingSox } = fixture();
    for (const sox of [missingSox, undefined]) {
      expect(denial(run("PreToolUse", question(COORDINATOR), { sox, quietHours: INSIDE }).stdout)).toContain(
        "COORDINATOR_QUIET_HOURS",
      );
      expect(run("PreToolUse", question(COORDINATOR), { sox, quietHours: OUTSIDE })).toMatchObject({
        status: 0,
        stdout: "",
      });
      expect(run("PreToolUse", question(COORDINATOR), { sox })).toMatchObject({ status: 0, stdout: "" });
    }
  });

  it("holds a window across midnight at its edges, start included and end excluded", () => {
    const { run, missingSox } = fixture();
    const at = (clock: string, quietHours = "22:00-08:09 America/Chicago") =>
      run("PreToolUse", question(COORDINATOR), { sox: missingSox, quietHours, clock }).stdout !== "";
    expect(["22:00", "23:59", "00:00", "08:08"].map((clock) => at(clock))).toEqual([true, true, true, true]);
    expect(["21:59", "08:09", "09:08", "12:00"].map((clock) => at(clock))).toEqual([false, false, false, false]);
    expect(at("03:00", "  22:00-08:00 America/Chicago ")).toBe(true);
  });

  it("finds its lease past an unreadable or dangling lease in another charter", () => {
    const { coordination, run } = fixture();
    mkdirSync(join(coordination, "aaa"));
    symlinkSync(join(coordination, "no-such-file"), join(coordination, "aaa", "lease"));
    mkdirSync(join(coordination, "aab"));
    writeFileSync(join(coordination, "aab", "lease"), "charter=aab\n");
    chmodSync(join(coordination, "aab", "lease"), 0o000);
    denial(run("PreToolUse", question(COORDINATOR), { presence: "away" }).stdout);
  });

  it("reads the report's own state, not a nested one", () => {
    const { run } = fixture();
    denial(run("PreToolUse", question(COORDINATOR), { presence: "nested" }).stdout);
  });

  it("treats malformed quiet hours as none", () => {
    const { run } = fixture();
    for (const quietHours of ["always", "22:00-07:00", "25:00-07:00 UTC", "22:00-07:00 Not/AZone", "09:00-09:00 UTC"]) {
      expect(run("PreToolUse", question(COORDINATOR), { quietHours })).toMatchObject({ status: 0, stdout: "" });
    }
  });

  it("never blocks on malformed input", () => {
    const { run } = fixture();
    for (const input of ["", "not json", "{}", JSON.stringify({ session_id: 42 })]) {
      expect(run("PreToolUse", input, { presence: "away" })).toMatchObject({ status: 0, stdout: "" });
    }
  });
});

describe("coordinator-session hook: after compaction", () => {
  function start(session: string, source: string) {
    return JSON.stringify({ session_id: session, hook_event_name: "SessionStart", source });
  }

  it("tells a coordinator to reload its skill, re-read its charter, and prune it", () => {
    const { coordination, run } = fixture();
    const result = run("SessionStart", start(COORDINATOR, "compact"));
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
    expect(output.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(output.hookSpecificOutput.additionalContext).toContain(join(coordination, "demo", "lease"));
    expect(output.hookSpecificOutput.additionalContext).toMatch(/invoke the skill for that role again/);
    expect(output.hookSpecificOutput.additionalContext).toMatch(/prune the charter/);
  });

  it("says nothing at startup or resume, or to other sessions", () => {
    const { run } = fixture();
    for (const input of [start(COORDINATOR, "startup"), start(COORDINATOR, "resume"), start(LANE, "compact")]) {
      expect(run("SessionStart", input)).toMatchObject({ status: 0, stdout: "" });
    }
  });
});
