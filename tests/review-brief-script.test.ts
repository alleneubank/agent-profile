import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// review-brief.sh run for real under /bin/bash (bash 3.2 on macOS) against
// the shipped charters.
const SKILL = resolve(__dirname, "../plugins/agent-workflows/skills/done");
const SCRIPT = join(SKILL, "scripts/review-brief.sh");
const SPECIALIST_INPUTS = ["goal", "scenarios", "threat-model", "production", "neighbors", "change"];

function inputsDirectory(inputs: string[]) {
  const directory = mkdtempSync(join(tmpdir(), "review-brief-"));
  for (const input of inputs) writeFileSync(join(directory, `${input}.md`), `the ${input} text\n`);
  return directory;
}

function run(...args: string[]) {
  const result = spawnSync("/bin/bash", [SCRIPT, ...args], { encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe("review-brief.sh", () => {
  it("prints the charter's text and every declared input", () => {
    const brief = run("specialist", inputsDirectory(SPECIALIST_INPUTS));
    expect(brief.status).toBe(0);
    const charter = readFileSync(join(SKILL, "references/specialist.md"), "utf8");
    expect(brief.stdout).toContain(charter.slice(charter.indexOf("You review one change")));
    expect(brief.stdout).not.toContain("brief-inputs");
    for (const input of SPECIALIST_INPUTS) {
      expect(brief.stdout).toContain(`## Input: ${input}\n\nthe ${input} text\n`);
    }
    expect(brief.stdout).not.toContain("## This round");
  });

  it("refuses a brief with a missing or empty input, naming each one", () => {
    const directory = inputsDirectory(SPECIALIST_INPUTS.filter((input) => input !== "threat-model"));
    writeFileSync(join(directory, "scenarios.md"), "");
    const brief = run("specialist", directory);
    expect(brief.status).toBe(4);
    expect(brief.stdout).toBe("");
    expect(brief.stderr).toContain("scenarios.md");
    expect(brief.stderr).toContain("threat-model.md");
  });

  it("refuses an input too large to paste", () => {
    const directory = inputsDirectory(SPECIALIST_INPUTS);
    writeFileSync(join(directory, "change.md"), "x".repeat(20001));
    expect(run("specialist", directory).status).toBe(5);
  });

  it("limits a later round to the earlier blocking findings", () => {
    const directory = inputsDirectory(SPECIALIST_INPUTS);
    const findings = join(directory, "round-1-blocking.txt");
    writeFileSync(findings, "land.py:120 the timeout message drops the remote\n");
    const brief = run("specialist", directory, findings);
    expect(brief.status).toBe(0);
    expect(brief.stdout).toMatch(/## This round\n\n[^]*whether each is closed[^]*land\.py:120 the timeout message drops the remote\n$/);
    expect(run("specialist", directory, join(directory, "absent.txt")).status).toBe(4);
  });

  it("builds a brief for every charter the skill ships", () => {
    const declared: Record<string, string[]> = {
      guest: ["intent", "scenarios", "build", "environment", "time-budget"],
      "design-reviewer": ["intent", "captures", "reference"],
      "plan-reviewer": ["goal", "scenarios", "threat-model", "design", "production", "plan", "alternatives", "standard", "code"],
    };
    for (const [role, inputs] of Object.entries(declared)) {
      expect(run(role, inputsDirectory(inputs)).status, role).toBe(0);
    }
  });

  it("rejects a role with no charter and a wrong argument count", () => {
    expect(run("auditor", inputsDirectory([])).status).toBe(3);
    expect(run("../SKILL", inputsDirectory([])).status).toBe(3);
    expect(run("specialist").status).toBe(2);
  });
});
