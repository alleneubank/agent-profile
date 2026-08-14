import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("../scripts/skill-usage.sh", import.meta.url));

interface Run {
  status: number;
  stdout: string;
  stderr: string;
}

function run(root: string, args: string[] = []): Run {
  try {
    const stdout = execFileSync(SCRIPT, ["--root", root, ...args], { encoding: "utf8" });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { status: failure.status ?? -1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
}

/** A transcript line shaped like a real Skill tool invocation. */
function invocation(skill: string): string {
  return `${JSON.stringify({
    type: "assistant",
    timestamp: "2026-08-13T12:00:00.000Z",
    sessionId: "session-1",
    message: { role: "assistant", content: [{ type: "tool_use", name: "Skill", input: { skill } }] },
  })}\n`;
}

/**
 * A transcript line that *names* a skill without invoking it — the skill
 * listing, or a session that merely discusses one. A grep-based detector
 * counts these; the parser must not.
 */
function mention(skill: string): string {
  return `${JSON.stringify({
    type: "assistant",
    timestamp: "2026-08-13T12:00:00.000Z",
    sessionId: "session-2",
    message: { role: "assistant", content: [{ type: "text", text: `Skill {"skill":"${skill}"} listed` }] },
  })}\n`;
}

describe("skill-usage detector", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "skill-usage-"));
    mkdirSync(join(root, "project"), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("fails closed when no transcripts exist", () => {
    const result = run(root);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("not evidence that no skill ran");
  });

  it("fails closed rather than printing a report that looks like a finding", () => {
    const result = run(root);
    expect(result.stdout).not.toContain("NEVER FIRED");
  });

  it("does not count a skill that is merely named, only one actually invoked", () => {
    writeFileSync(join(root, "project", "a.jsonl"), mention("engineering-practices:code-law"));
    const result = run(root);
    // A grep detector reports 1 here. Failing closed is the correct answer:
    // the transcript contains the name but the skill never ran.
    expect(result.status).toBe(2);
  });

  it("counts real invocations and reports the skill as fired", () => {
    writeFileSync(
      join(root, "project", "a.jsonl"),
      invocation("engineering-practices:code-law") +
        invocation("engineering-practices:code-law") +
        mention("engineering-practices:rust-best-practices"),
    );
    const result = run(root, ["--plugin", "engineering-practices", "--json"]);
    expect(result.status).toBe(0);

    const report = JSON.parse(result.stdout) as {
      control_total: number;
      fired: { skill: string; invocations: number; sessions: number }[];
      never_fired: string[];
    };
    expect(report.control_total).toBe(2);
    expect(report.fired).toEqual([
      { skill: "engineering-practices:code-law", invocations: 2, sessions: 1 },
    ]);
    // Named but never invoked, so it stays on the never-fired list.
    expect(report.never_fired).toContain("engineering-practices:rust-best-practices");
  });

  it("excludes invocations older than the window but still passes the control", () => {
    writeFileSync(join(root, "project", "a.jsonl"), invocation("engineering-practices:code-law"));
    const result = run(root, ["--since", "1h", "--json"]);
    expect(result.status).toBe(0);

    const report = JSON.parse(result.stdout) as { control_total: number; fired: unknown[] };
    // The control is deliberately unwindowed: an empty window is a real answer,
    // an empty control is a broken detector.
    expect(report.control_total).toBe(1);
    expect(report.fired).toEqual([]);
  });

  it("rejects a malformed --since instead of silently counting everything", () => {
    writeFileSync(join(root, "project", "a.jsonl"), invocation("engineering-practices:code-law"));
    const result = run(root, ["--since", "yesterday"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("invalid --since");
  });
});
