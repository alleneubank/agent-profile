import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function hasSkillMd(dir: string): boolean {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    if (existsSync(join(full, "SKILL.md"))) return true;
    if (hasSkillMd(full)) return true;
  }
  return false;
}

describe("pi package manifest", () => {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf-8"));
  const pi = pkg.pi as {
    extensions?: string[];
    skills?: string[];
  };
  const skills = pi.skills ?? [];

  it("declares the pi manifest with extensions, skills, and the pi-package keyword", () => {
    expect(pi).toBeDefined();
    expect(pi.extensions).toContain("./extensions/pi-hooks.ts");
    expect(skills).toContain("./plugins/engineering-practices/skills");
    expect(skills).toContain("./plugins/agent-workflows/skills");
    expect(pkg.keywords).toContain("pi-package");
    expect(pkg.peerDependencies["@earendil-works/pi-coding-agent"]).toBe("*");
  });

  it("every referenced manifest path resolves on disk", () => {
    for (const ext of pi.extensions ?? []) {
      expect(existsSync(resolve(ROOT, ext))).toBe(true);
    }
    for (const dir of skills) {
      expect(existsSync(resolve(ROOT, dir))).toBe(true);
    }
  });

  it("each skill dir contains at least one SKILL.md", () => {
    for (const dir of skills) {
      expect(hasSkillMd(resolve(ROOT, dir))).toBe(true);
    }
  });

  it("hooks.json events map to a pi analogue or are documented skips", () => {
    const hooks = JSON.parse(
      readFileSync(
        resolve(ROOT, "plugins/agent-workflows/hooks/hooks.json"),
        "utf-8",
      ),
    ) as { hooks: Record<string, unknown> };
    const declared = Object.keys(hooks.hooks);
    // SessionStart -> session_start and PreToolUse -> tool_call. SubagentStart
    // has no pi analogue; missionctl's separate plugin owns compaction hooks.
    expect(declared.sort()).toEqual(["PreToolUse", "SessionStart", "SubagentStart"]);
  });
});
