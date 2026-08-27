import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SKILLS = new URL("../plugins/engineering-practices/skills/", import.meta.url);

/**
 * The zsh MULTIOS law is shell-level, so it applies to every skill that prints
 * a credential. It is duplicated verbatim rather than referenced, because a
 * pointer fails open when only one of the skills is loaded and the failure mode
 * is a leaked live credential. Duplication is only safe while the copies cannot
 * drift, so identity is a floor rather than a convention.
 */
const HEADING = "### The zsh MULTIOS trap";
const CARRIERS = ["op-cli", "fnox-cli"] as const;

/** The block runs from its heading to the next heading at any level. */
function sharedBlock(skill: string): string {
  const path = fileURLToPath(new URL(`${skill}/SKILL.md`, SKILLS));
  const text = readFileSync(path, "utf8");
  const start = text.indexOf(HEADING);
  if (start === -1) throw new Error(`${skill}/SKILL.md is missing "${HEADING}"`);
  const rest = text.slice(start + HEADING.length);
  const end = rest.search(/^#/m);
  return HEADING + (end === -1 ? rest : rest.slice(0, end)).trimEnd();
}

interface Probe {
  command: string;
  /** The documented result: the value reaches the pipeline, or it does not. */
  leaks: boolean;
}

/**
 * The block's own fenced example is the specification. Parsing it means the
 * test fails when the prose claims a result the shell does not produce.
 */
function probes(block: string): Probe[] {
  const fence = block.match(/```bash\n([\s\S]*?)```/);
  if (!fence) throw new Error(`${HEADING} has no bash example to verify`);
  return fence[1]
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const parsed = line.match(/^(.*?)\s{2,}#\s*(LEAKED|\(nothing\))$/);
      if (!parsed) throw new Error(`probe line is not annotated with its result: ${line}`);
      return { command: parsed[1].trim(), leaks: parsed[2] === "LEAKED" };
    });
}

function hasShell(shell: string): boolean {
  try {
    execFileSync("command", ["-v", shell], { shell: "/bin/sh", stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("shared MULTIOS law", () => {
  it("is byte-identical in every skill that carries it", () => {
    const [canonical, ...copies] = CARRIERS.map(sharedBlock);
    copies.forEach((copy, index) => {
      expect(copy, `${CARRIERS[index + 1]} drifted from ${CARRIERS[0]}`).toBe(canonical);
    });
  });

  it("names both credential tools it governs", () => {
    const prose = sharedBlock(CARRIERS[0]).replace(/\s+/g, " ");
    expect(prose).toContain("op read");
    expect(prose).toContain("fnox get");
  });

  it("demonstrates the trap without a real credential", () => {
    const block = sharedBlock(CARRIERS[0]);
    for (const probe of probes(block)) {
      expect(probe.command).not.toMatch(/\b(op|fnox|aws)\b/);
    }
  });

  it.skipIf(!hasShell("zsh") || !hasShell("bash"))(
    "reproduces the four documented results",
    () => {
      for (const probe of probes(sharedBlock(CARRIERS[0]))) {
        const stdout = execFileSync("/bin/sh", ["-c", probe.command], { encoding: "utf8" });
        expect(stdout.trim(), `unexpected output from: ${probe.command}`).toBe(
          probe.leaks ? "LEAKED" : "",
        );
      }
    },
  );
});
