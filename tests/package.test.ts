import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKILL_ROOTS = [
  resolve(ROOT, "plugins/engineering-practices/skills"),
  resolve(ROOT, "plugins/agent-workflows/skills"),
];
const RETIRED_SKILLS = [
  "plugins/agent-workflows/skills/spec-interview",
  "plugins/engineering-practices/skills/electrobun-best-practices",
  "plugins/engineering-practices/skills/ios-device-toolkit",
  "plugins/engineering-practices/skills/axe-ios-simulator",
];

function hasSkillMd(dir: string): boolean {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    if (existsSync(join(full, "SKILL.md"))) return true;
    if (hasSkillMd(full)) return true;
  }
  return false;
}

function filesBelow(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...filesBelow(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

function referencesOnLine(path: string, marker: string): string[] {
  const line = readFileSync(path, "utf-8")
    .split("\n")
    .find((candidate) => candidate.includes(marker));
  expect(line, `missing route marker ${marker} in ${path}`).toBeDefined();
  return [...(line ?? "").matchAll(/\]\((references\/[^)]+)\)/g)].map(
    (match) => match[1],
  );
}

describe("public skill catalog", () => {
  it("ships exactly 41 top-level skill entrypoints", () => {
    const entrypoints = SKILL_ROOTS.flatMap((root) =>
      readdirSync(root)
        .map((entry) => join(root, entry, "SKILL.md"))
        .filter(existsSync),
    );
    expect(entrypoints).toHaveLength(41);
  });

  it("replaces the four retired entrypoints with platform-tooling", () => {
    expect(
      existsSync(
        resolve(
          ROOT,
          "plugins/engineering-practices/skills/platform-tooling/SKILL.md",
        ),
      ),
    ).toBe(true);
    for (const retired of RETIRED_SKILLS) {
      expect(existsSync(resolve(ROOT, retired)), retired).toBe(false);
    }
  });

  it("keeps references out of recursive skill discovery", () => {
    const nestedEntrypoints = SKILL_ROOTS.flatMap(filesBelow).filter(
      (path) => path.endsWith("/references/SKILL.md") || path.includes("/references/") && path.endsWith("/SKILL.md"),
    );
    expect(nestedEntrypoints).toEqual([]);
  });

  it.each([
    {
      skill: "plugins/engineering-practices/skills/platform-tooling/SKILL.md",
      marker: "Electrobun tasks",
      reference: "references/electrobun/guide.md",
    },
    {
      skill: "plugins/engineering-practices/skills/platform-tooling/SKILL.md",
      marker: "Physical iOS or `pymobiledevice3` tasks",
      reference: "references/physical-ios/guide.md",
    },
    {
      skill: "plugins/engineering-practices/skills/platform-tooling/SKILL.md",
      marker: "AXe / iOS Simulator tasks",
      reference: "references/axe-ios-simulator.md",
    },
    {
      skill: "plugins/engineering-practices/skills/spec-best-practices/SKILL.md",
      marker: "Interview, complete, or find gaps in a `SPEC.md`",
      reference: "references/interview.md",
    },
  ])("routes $marker only to $reference", ({ skill, marker, reference }) => {
    expect(referencesOnLine(resolve(ROOT, skill), marker)).toEqual([reference]);
  });

  it("resolves every archived guide link from its router", () => {
    const routes = [
      [
        "plugins/engineering-practices/skills/platform-tooling/SKILL.md",
        "Electrobun tasks",
      ],
      [
        "plugins/engineering-practices/skills/platform-tooling/SKILL.md",
        "Physical iOS or `pymobiledevice3` tasks",
      ],
      [
        "plugins/engineering-practices/skills/platform-tooling/SKILL.md",
        "AXe / iOS Simulator tasks",
      ],
      [
        "plugins/engineering-practices/skills/spec-best-practices/SKILL.md",
        "Interview, complete, or find gaps in a `SPEC.md`",
      ],
    ] as const;

    for (const [skill, marker] of routes) {
      const skillPath = resolve(ROOT, skill);
      for (const reference of referencesOnLine(skillPath, marker)) {
        expect(existsSync(resolve(dirname(skillPath), reference)), reference).toBe(
          true,
        );
      }
    }
  });
});

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
    // has no pi analogue; missionctl's separate plugin owns its loop-context hook.
    expect(declared.sort()).toEqual(["PreToolUse", "SessionStart", "SubagentStart"]);
  });
});
