import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SOURCE_SCRIPT = fileURLToPath(new URL("../scripts/skill-usage.sh", import.meta.url));
const ALL_SOURCES = ["claude_code", "codex", "pi_agent", "grok", "kimi_code"];

interface CensusRow {
  skill_name: string;
  source: string;
  host: string;
  invocations: number;
  sessions: number;
}

interface Population {
  considered_sessions: number;
  attributed_invocations: number;
  unattributed_candidates: number;
}

interface Coverage extends Population {
  scope: "local" | "local+fleet";
  expected_hosts: string[];
  successful_hosts: string[];
  covered_sources: string[];
  control: Population;
}

interface Census {
  rows: CensusRow[];
  coverage: Coverage;
}

interface RunOptions {
  census?: Census;
  rawPayload?: string;
  recallExit?: number;
  recallError?: string;
  includeRecall?: boolean;
}

interface Run {
  status: number;
  stdout: string;
  stderr: string;
}

function makeCensus(
  rows: CensusRow[] = [
    {
      skill_name: "engineering-practices:code-law",
      source: "codex",
      host: "control",
      invocations: 2,
      sessions: 1,
    },
  ],
  coverage: Partial<Coverage> = {},
): Census {
  const attributedInvocations = rows.reduce((total, row) => total + row.invocations, 0);
  const consideredSessions = rows.reduce((total, row) => total + row.sessions, 0);
  return {
    rows,
    coverage: {
      scope: "local+fleet",
      expected_hosts: ["control", "edge"],
      successful_hosts: ["control", "edge"],
      covered_sources: ALL_SOURCES,
      considered_sessions: consideredSessions,
      attributed_invocations: attributedInvocations,
      unattributed_candidates: 0,
      control: {
        considered_sessions: Math.max(consideredSessions, 1),
        attributed_invocations: Math.max(attributedInvocations, 1),
        unattributed_candidates: 0,
      },
      ...coverage,
    },
  };
}

describe("skill-usage Recall wrapper", () => {
  let root: string;
  let catalogRoot: string;
  let script: string;
  let fakeBin: string;
  let payloadPath: string;
  let argsPath: string;

  function declareSkill(plugin: string, skill: string): void {
    const path = join(catalogRoot, "plugins", plugin, "skills", skill, "SKILL.md");
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, `---\nname: ${skill}\ndescription: test fixture\n---\n`);
  }

  function run(args: string[] = [], options: RunOptions = {}): Run {
    const includeRecall = options.includeRecall ?? true;
    if (existsSync(argsPath)) {
      rmSync(argsPath);
    }
    writeFileSync(payloadPath, options.rawPayload ?? JSON.stringify(options.census ?? makeCensus()));
    const path = includeRecall
      ? `${fakeBin}${delimiter}${process.env.PATH ?? "/usr/bin:/bin"}`
      : "/usr/bin:/bin";
    const result = spawnSync(script, args, {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: path,
        FAKE_RECALL_ARGS: argsPath,
        FAKE_RECALL_PAYLOAD: payloadPath,
        FAKE_RECALL_EXIT:
          options.recallExit === undefined ? undefined : String(options.recallExit),
        FAKE_RECALL_ERROR: options.recallError,
      },
    });
    return {
      status: result.status ?? -1,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  function recallArgs(): string[] {
    if (!existsSync(argsPath)) {
      return [];
    }
    return readFileSync(argsPath, "utf8").split("\n").filter(Boolean);
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "skill-usage-"));
    catalogRoot = join(root, "catalog");
    const scriptsDir = join(catalogRoot, "scripts");
    fakeBin = join(root, "bin");
    payloadPath = join(root, "payload.json");
    argsPath = join(root, "recall-args.txt");
    mkdirSync(scriptsDir, { recursive: true });
    mkdirSync(fakeBin, { recursive: true });
    script = join(scriptsDir, "skill-usage.sh");
    copyFileSync(SOURCE_SCRIPT, script);
    chmodSync(script, 0o755);
    writeFileSync(
      join(fakeBin, "recall"),
      `#!/bin/sh
: > "$FAKE_RECALL_ARGS"
for arg in "$@"; do
  printf '%s\\n' "$arg" >> "$FAKE_RECALL_ARGS"
done
if [ -n "\${FAKE_RECALL_EXIT:-}" ]; then
  printf '%s\\n' "\${FAKE_RECALL_ERROR:-recall failed}" >&2
  exit "$FAKE_RECALL_EXIT"
fi
cat "$FAKE_RECALL_PAYLOAD"
`,
    );
    chmodSync(join(fakeBin, "recall"), 0o755);
    declareSkill("engineering-practices", "code-law");
    declareSkill("engineering-practices", "rust-best-practices");
    declareSkill("agent-workflows", "afk");
    declareSkill("agent-workflows", "writing-plans");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("aggregates exact declared names across source and host rows", () => {
    const census = makeCensus([
      {
        skill_name: "engineering-practices:code-law",
        source: "codex",
        host: "control",
        invocations: 2,
        sessions: 1,
      },
      {
        skill_name: "engineering-practices:code-law",
        source: "grok",
        host: "edge",
        invocations: 3,
        sessions: 2,
      },
    ]);

    const result = run(["--json"], { census });

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout) as {
      control_total: number;
      fired: { skill: string; invocations: number; sessions: number }[];
      never_fired: string[];
      unmatched: unknown[];
      coverage: Coverage;
    };
    expect(report.control_total).toBe(5);
    expect(report.fired).toEqual([
      { skill: "engineering-practices:code-law", invocations: 5, sessions: 3 },
    ]);
    expect(report.never_fired).toContain("engineering-practices:rust-best-practices");
    expect(report.unmatched).toEqual([]);
    expect(report.coverage).toEqual(census.coverage);
  });

  it("maps a unique bare name to its declared canonical skill", () => {
    const census = makeCensus([
      {
        skill_name: "code-law",
        source: "pi_agent",
        host: "control",
        invocations: 4,
        sessions: 2,
      },
    ]);

    const result = run(["--json"], { census });

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout) as {
      fired: { skill: string; invocations: number; sessions: number }[];
    };
    expect(report.fired).toEqual([
      { skill: "engineering-practices:code-law", invocations: 4, sessions: 2 },
    ]);
  });

  it("fails before never_fired when a bare name is ambiguous", () => {
    declareSkill("agent-workflows", "code-law");
    const census = makeCensus([
      {
        skill_name: "code-law",
        source: "codex",
        host: "control",
        invocations: 1,
        sessions: 1,
      },
    ]);

    const result = run(["--json"], { census });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("ambiguous bare skill name");
    expect(result.stdout).not.toContain("never_fired");
  });

  it("reports unrelated names without treating them as catalog coverage", () => {
    const census = makeCensus([
      {
        skill_name: "engineering-practices:code-law",
        source: "codex",
        host: "control",
        invocations: 1,
        sessions: 1,
      },
      {
        skill_name: "third-party:foreign",
        source: "grok",
        host: "edge",
        invocations: 3,
        sessions: 2,
      },
    ]);

    const result = run(["--plugin", "engineering-practices", "--json"], { census });

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout) as {
      fired: { skill: string }[];
      never_fired: string[];
      unmatched: {
        skill: string;
        invocations: number;
        sessions: number;
        sources: string[];
        hosts: string[];
      }[];
    };
    expect(report.fired.map((row) => row.skill)).toEqual([
      "engineering-practices:code-law",
    ]);
    expect(report.never_fired).toEqual(["engineering-practices:rust-best-practices"]);
    expect(report.unmatched).toEqual([
      {
        skill: "third-party:foreign",
        invocations: 3,
        sessions: 2,
        sources: ["grok"],
        hosts: ["edge"],
      },
    ]);
  });

  it("forwards Recall options but keeps plugin filtering in the wrapper", () => {
    const census = makeCensus(undefined, {
      scope: "local",
      expected_hosts: ["control"],
      successful_hosts: ["control"],
      covered_sources: ["codex", "grok"],
    });

    const result = run(
      [
        "--since",
        "30d",
        "--plugin",
        "engineering-practices",
        "--source",
        "codex",
        "--source",
        "grok",
        "--local",
        "--fleet-config",
        "/tmp/fleet.toml",
        "--json",
      ],
      { census },
    );

    expect(result.status).toBe(0);
    expect(recallArgs()).toEqual([
      "stats",
      "skills",
      "--json",
      "--since",
      "30d",
      "--source",
      "codex",
      "--source",
      "grok",
      "--local",
      "--fleet-config",
      "/tmp/fleet.toml",
    ]);
  });

  it("removes the transcript --root option", () => {
    const result = run(["--root", "/tmp/transcripts"]);

    expect(result.status).toBe(64);
    expect(result.stderr).toContain("unknown argument: --root");
    expect(recallArgs()).toEqual([]);
  });

  it("fails closed when Recall is missing", () => {
    const result = run(["--json"], { includeRecall: false });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("recall executable not found");
    expect(result.stdout).not.toContain("never_fired");
  });

  it("fails closed when Recall returns an error", () => {
    const result = run(["--json"], { recallExit: 7, recallError: "remote unavailable" });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("remote unavailable");
    expect(result.stdout).not.toContain("never_fired");
  });

  it("fails closed when Recall returns malformed JSON", () => {
    const result = run(["--json"], { rawPayload: "not-json" });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("invalid Recall JSON");
    expect(result.stdout).not.toContain("never_fired");
  });

  it("fails closed when expected and successful hosts differ", () => {
    const census = makeCensus(undefined, { successful_hosts: ["control"] });

    const result = run(["--json"], { census });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("incomplete Recall host coverage");
    expect(result.stdout).not.toContain("never_fired");
  });

  it("fails closed when covered sources are incomplete", () => {
    const census = makeCensus(undefined, { covered_sources: ["claude_code", "codex"] });

    const result = run(["--json"], { census });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("incomplete Recall source coverage");
    expect(result.stdout).not.toContain("never_fired");
  });

  it("fails closed when coverage counters disagree with the rows", () => {
    const census = makeCensus(undefined, {
      attributed_invocations: 99,
      control: {
        considered_sessions: 1,
        attributed_invocations: 99,
        unattributed_candidates: 0,
      },
    });

    const result = run(["--json"], { census });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("attributed invocation total");
    expect(result.stdout).not.toContain("never_fired");
  });

  it("fails closed when an invocation row has no distinct session", () => {
    const census = makeCensus(
      [
        {
          skill_name: "engineering-practices:code-law",
          source: "codex",
          host: "control",
          invocations: 1,
          sessions: 0,
        },
      ],
      { considered_sessions: 1 },
    );

    const result = run(["--json"], { census });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("inconsistent invocation/session counts");
    expect(result.stdout).not.toContain("never_fired");
  });

  it("fails closed when a row exceeds the considered-session population", () => {
    const census = makeCensus(
      [
        {
          skill_name: "engineering-practices:code-law",
          source: "codex",
          host: "control",
          invocations: 2,
          sessions: 2,
        },
      ],
      {
        considered_sessions: 1,
        control: {
          considered_sessions: 1,
          attributed_invocations: 2,
          unattributed_candidates: 0,
        },
      },
    );

    const result = run(["--json"], { census });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("exceeds the considered-session population");
    expect(result.stdout).not.toContain("never_fired");
  });

  it("reports honest session bounds when aliases collide inside one source and host", () => {
    const census = makeCensus(
      [
        {
          skill_name: "engineering-practices:code-law",
          source: "codex",
          host: "control",
          invocations: 1,
          sessions: 1,
        },
        {
          skill_name: "code-law",
          source: "codex",
          host: "control",
          invocations: 1,
          sessions: 1,
        },
      ],
      {
        considered_sessions: 10,
        control: {
          considered_sessions: 10,
          attributed_invocations: 2,
          unattributed_candidates: 0,
        },
      },
    );

    const result = run(["--json"], { census });

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout) as {
      fired: {
        skill: string;
        invocations: number;
        sessions: number | null;
        session_bounds?: { minimum: number; maximum: number };
      }[];
      never_fired: string[];
    };
    expect(report.fired).toContainEqual({
      skill: "engineering-practices:code-law",
      invocations: 2,
      sessions: null,
      session_bounds: { minimum: 1, maximum: 2 },
    });
    expect(report.never_fired).toContain("engineering-practices:rust-best-practices");
  });

  it("deduplicates alias sessions when the window population proves overlap", () => {
    const census = makeCensus(
      [
        {
          skill_name: "engineering-practices:code-law",
          source: "codex",
          host: "control",
          invocations: 1,
          sessions: 1,
        },
        {
          skill_name: "code-law",
          source: "codex",
          host: "control",
          invocations: 1,
          sessions: 1,
        },
      ],
      {
        considered_sessions: 1,
        control: {
          considered_sessions: 1,
          attributed_invocations: 2,
          unattributed_candidates: 0,
        },
      },
    );

    const result = run(["--json"], { census });

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout) as {
      fired: { skill: string; invocations: number; sessions: number }[];
    };
    expect(report.fired).toContainEqual({
      skill: "engineering-practices:code-law",
      invocations: 2,
      sessions: 1,
    });
  });

  it("caps summed alias-session bounds at the window population", () => {
    const census = makeCensus(
      [
        {
          skill_name: "engineering-practices:code-law",
          source: "codex",
          host: "control",
          invocations: 1,
          sessions: 1,
        },
        {
          skill_name: "code-law",
          source: "codex",
          host: "control",
          invocations: 1,
          sessions: 1,
        },
        {
          skill_name: "engineering-practices:code-law",
          source: "grok",
          host: "edge",
          invocations: 1,
          sessions: 1,
        },
        {
          skill_name: "code-law",
          source: "grok",
          host: "edge",
          invocations: 1,
          sessions: 1,
        },
      ],
      {
        considered_sessions: 3,
        control: {
          considered_sessions: 3,
          attributed_invocations: 4,
          unattributed_candidates: 0,
        },
      },
    );

    const result = run(["--json"], { census });

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout) as {
      fired: {
        skill: string;
        invocations: number;
        sessions: number | null;
        session_bounds?: { minimum: number; maximum: number };
      }[];
    };
    expect(report.fired).toContainEqual({
      skill: "engineering-practices:code-law",
      invocations: 4,
      sessions: null,
      session_bounds: { minimum: 2, maximum: 3 },
    });
  });

  it("fails closed when summed session minima exceed the window population", () => {
    const census = makeCensus(
      [
        {
          skill_name: "engineering-practices:code-law",
          source: "codex",
          host: "control",
          invocations: 1,
          sessions: 1,
        },
        {
          skill_name: "engineering-practices:code-law",
          source: "grok",
          host: "edge",
          invocations: 1,
          sessions: 1,
        },
      ],
      {
        considered_sessions: 1,
        control: {
          considered_sessions: 1,
          attributed_invocations: 2,
          unattributed_candidates: 0,
        },
      },
    );

    const result = run(["--json"], { census });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("session minimum exceeds");
    expect(result.stdout).not.toContain("never_fired");
  });

  it("validates impossible canonical rows outside the selected plugin", () => {
    const census = makeCensus(
      [
        {
          skill_name: "engineering-practices:code-law",
          source: "codex",
          host: "control",
          invocations: 1,
          sessions: 1,
        },
        {
          skill_name: "engineering-practices:code-law",
          source: "grok",
          host: "edge",
          invocations: 1,
          sessions: 1,
        },
      ],
      {
        considered_sessions: 1,
        control: {
          considered_sessions: 1,
          attributed_invocations: 2,
          unattributed_candidates: 0,
        },
      },
    );

    const result = run(["--plugin", "agent-workflows", "--json"], { census });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("session minimum exceeds");
    expect(result.stdout).not.toContain("never_fired");
  });

  it("renders uncertain session bounds in text output", () => {
    const census = makeCensus(
      [
        {
          skill_name: "engineering-practices:code-law",
          source: "codex",
          host: "control",
          invocations: 1,
          sessions: 1,
        },
        {
          skill_name: "code-law",
          source: "codex",
          host: "control",
          invocations: 1,
          sessions: 1,
        },
      ],
      {
        considered_sessions: 10,
        control: {
          considered_sessions: 10,
          attributed_invocations: 2,
          unattributed_candidates: 0,
        },
      },
    );

    const result = run([], { census });

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/engineering-practices:code-law\s+2\s+1-2/);
  });

  it.each([
    {
      label: "sessions",
      control: {
        considered_sessions: 0,
        attributed_invocations: 2,
        unattributed_candidates: 0,
      },
    },
    {
      label: "invocations",
      control: {
        considered_sessions: 2,
        attributed_invocations: 0,
        unattributed_candidates: 0,
      },
    },
  ])("fails closed when control $label are empty", ({ control }) => {
    const census = makeCensus(undefined, { control });

    const result = run(["--json"], { census });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("empty Recall control population");
    expect(result.stdout).not.toContain("never_fired");
  });

  it("accepts an empty recent window when the all-time control is populated", () => {
    const census = makeCensus([], {
      considered_sessions: 0,
      attributed_invocations: 0,
      control: {
        considered_sessions: 5,
        attributed_invocations: 3,
        unattributed_candidates: 1,
      },
    });

    const result = run(["--since", "1h", "--json"], { census });

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout) as {
      window: string;
      control_total: number;
      fired: unknown[];
      never_fired: string[];
    };
    expect(report.window).toBe("1h");
    expect(report.control_total).toBe(3);
    expect(report.fired).toEqual([]);
    expect(report.never_fired).toHaveLength(4);
  });
});
