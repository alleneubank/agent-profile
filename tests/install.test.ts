import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// install.sh, run for real under /bin/bash. Codex and Claude are absent unless
// a test puts a stub on PATH. The stub only speaks the marketplace list/add
// commands this script shells out to; it is not the real CLI, so a passing
// stub case does not show that Codex or Claude themselves register a marketplace.
const SCRIPT = resolve(__dirname, "../install.sh");
const ROOT = resolve(__dirname, "..");
const SOURCE = join(ROOT, "AGENTS.md");

const STUB = `#!/bin/bash
tool="$(basename "$0")"
printf '%s %s\\n' "$tool" "$*" >> "$INSTALL_STUB_LOG"
state="$INSTALL_STUB_STATE"
root="$INSTALL_ROOT"
if [ "$1 $2 $3" = "plugin marketplace list" ]; then
  if [ -f "$state/$tool" ]; then
    if [ "$tool" = "codex" ]; then
      printf '{"marketplaces":[{"name":"agent-profile","root":"%s"}]}\\n' "$root"
    else
      printf '[{"name":"agent-profile","path":"%s"}]\\n' "$root"
    fi
  elif [ "$tool" = "codex" ]; then
    printf '%s\\n' '{"marketplaces":[]}'
  else
    printf '%s\\n' '[]'
  fi
  exit 0
fi
if [ "$1 $2 $3" = "plugin marketplace add" ]; then
  if [ "$INSTALL_STUB_MODE" = "fail-add" ]; then
    exit 1
  fi
  mkdir -p "$state"
  printf '%s\\n' "$4" > "$state/$tool"
  exit 0
fi
printf 'unexpected %s\\n' "$*" >&2
exit 1
`;

function host(pathSuffix = "/usr/bin:/bin") {
  // install.sh prints canonical paths; macOS TMPDIR is a symlink into /private.
  const home = realpathSync(mkdtempSync(join(tmpdir(), "install-sh-")));
  const bin = join(home, "bin");
  const state = join(home, "state");
  const log = join(home, "cli.log");
  mkdirSync(bin);
  const run = (mode: "--check" | "--fix", extra: Record<string, string> = {}) => {
    const result = spawnSync("/bin/bash", [SCRIPT, mode], {
      env: {
        PATH: `${bin}:${pathSuffix}`,
        HOME: home,
        INSTALL_STUB_LOG: log,
        INSTALL_STUB_STATE: state,
        INSTALL_ROOT: ROOT,
        ...extra,
      },
      encoding: "utf8",
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  };
  const cliLog = () => (existsSync(log) ? readFileSync(log, "utf8") : "");
  return { home, bin, run, cliLog };
}

function toolsWithoutJq() {
  const tools = mkdtempSync(join(tmpdir(), "install-tools-"));
  for (const name of ["dirname", "mkdir", "ln", "readlink", "mv", "date", "realpath", "git", "basename"]) {
    const found = spawnSync("/bin/bash", ["-c", `command -v ${name}`], {
      env: { PATH: "/usr/bin:/bin" },
      encoding: "utf8",
    });
    if (found.status !== 0 || !found.stdout.trim()) {
      throw new Error(`host is missing ${name}`);
    }
    symlinkSync(found.stdout.trim(), join(tools, name));
  }
  return tools;
}

function stubClis(bin: string) {
  const script = join(bin, "marketplace-stub");
  writeFileSync(script, STUB);
  chmodSync(script, 0o755);
  symlinkSync(script, join(bin, "codex"));
  symlinkSync(script, join(bin, "claude"));
}

const WORKFLOW_SKILLS = join(ROOT, "plugins/agent-workflows/skills");
const PRACTICE_SKILLS = join(ROOT, "plugins/engineering-practices/skills");
const CURSOR_READ = `cursor: AGENTS.md is ${SOURCE}. Read it and follow it. Do not copy it into a repository.`;
const CURSOR_SKILLS = `cursor: skills are in ${WORKFLOW_SKILLS} and ${PRACTICE_SKILLS}. Load the skill whose description matches the next action before that action.`;

describe("install.sh", () => {
  it("skips a missing harness CLI and exits 0 once instructions are linked", () => {
    const h = host();

    const check = h.run("--check");
    expect(check.status).toBe(1);
    expect(check.stdout).toContain("skipped: codex CLI is not installed\n");
    expect(check.stdout).toContain("skipped: claude CLI is not installed\n");
    expect(check.stdout).not.toContain("registered");
    expect(check.stdout).not.toContain("requires jq");
    expect(check.stderr).not.toContain("command not found");
    expect(existsSync(join(h.home, ".codex", "AGENTS.md"))).toBe(false);
    expect(existsSync(join(h.home, ".claude", "CLAUDE.md"))).toBe(false);

    const fix = h.run("--fix");
    expect(fix.status).toBe(0);
    expect(fix.stdout).toContain("skipped: codex CLI is not installed\n");
    expect(fix.stdout).toContain("skipped: claude CLI is not installed\n");
    expect(fix.stdout).not.toContain("registered");
    expect(fix.stderr).not.toContain("command not found");
    expect(readlinkSync(join(h.home, ".codex", "AGENTS.md"))).toBe(SOURCE);
    expect(readlinkSync(join(h.home, ".claude", "CLAUDE.md"))).toBe(SOURCE);

    const again = h.run("--fix");
    expect(again.status).toBe(0);
    expect(again.stdout).toContain("ok: Codex instructions");
    expect(again.stdout).toContain("skipped: codex CLI is not installed\n");
    expect(again.stdout).not.toContain("registered");

    const settled = h.run("--check");
    expect(settled.status).toBe(0);
    expect(settled.stdout).toContain("skipped: claude CLI is not installed\n");
    expect(settled.stdout).not.toContain("registered");
  });

  it("requires jq only when a harness CLI is present and does not invoke that CLI", () => {
    const isolated = host(toolsWithoutJq());
    stubClis(isolated.bin);

    const check = isolated.run("--check");
    expect(check.status).toBe(1);
    expect(check.stdout).toContain("missing-tool: cannot check codex marketplace; requires jq\n");
    expect(check.stdout).toContain("missing-tool: cannot check claude marketplace; requires jq\n");
    expect(isolated.cliLog()).toBe("");

    const fix = isolated.run("--fix");
    expect(fix.status).toBe(1);
    expect(fix.stderr).toContain("blocked: cannot register codex marketplace; requires jq\n");
    expect(fix.stderr).toContain("blocked: cannot register claude marketplace; requires jq\n");
    expect(fix.stdout).not.toContain("registered");
    expect(isolated.cliLog()).toBe("");
  });

  it("does not report a failed marketplace add as registered", () => {
    const h = host();
    stubClis(h.bin);

    const fix = h.run("--fix", { INSTALL_STUB_MODE: "fail-add" });
    expect(fix.status).toBe(1);
    expect(fix.stdout).not.toContain("registered");
    expect(fix.stderr).toContain("failed: could not register codex marketplace\n");
    expect(fix.stderr).toContain("failed: could not register claude marketplace\n");
    expect(h.cliLog()).toContain(`codex plugin marketplace add ${ROOT}\n`);
    expect(h.cliLog()).toContain(`claude plugin marketplace add ${ROOT}\n`);
  });

  it("registers a marketplace only after add succeeds, then leaves it alone", () => {
    const h = host();
    stubClis(h.bin);

    const fix = h.run("--fix");
    expect(fix.status).toBe(0);
    expect(fix.stdout).toContain("fixed: registered codex marketplace\n");
    expect(fix.stdout).toContain("fixed: registered claude marketplace\n");
    expect(h.cliLog()).toContain(`codex plugin marketplace add ${ROOT}\n`);

    const again = h.run("--fix");
    expect(again.status).toBe(0);
    expect(again.stdout).toContain("ok: codex marketplace registered\n");
    expect(again.stdout).toContain("ok: claude marketplace registered\n");
    expect(again.stdout).not.toContain("fixed: registered");
    const adds = h.cliLog().split("\n").filter((line) => line.endsWith(`plugin marketplace add ${ROOT}`));
    expect(adds).toEqual([`codex plugin marketplace add ${ROOT}`, `claude plugin marketplace add ${ROOT}`]);
  });

  it("does not report an instruction link as fixed when its directory cannot be created", () => {
    const h = host();
    writeFileSync(join(h.home, ".codex"), "not a directory");

    const fix = h.run("--fix");
    expect(fix.status).toBe(1);
    expect(fix.stdout).not.toContain("fixed: Codex instructions");
    expect(fix.stderr).toContain(`failed: could not create ${join(h.home, ".codex")}\n`);
    expect(readlinkSync(join(h.home, ".claude", "CLAUDE.md"))).toBe(SOURCE);
  });

  it("does not register codex when its config is in another git worktree", () => {
    const h = host();
    stubClis(h.bin);
    const other = join(h.home, "other-repo");
    mkdirSync(other);
    const init = spawnSync("git", ["init"], { cwd: other, encoding: "utf8" });
    expect(init.status).toBe(0);
    const config = join(other, "config.toml");
    writeFileSync(config, "");

    const fix = h.run("--fix", { CODEX_CONFIG: config });
    expect(fix.status).toBe(1);
    expect(fix.stderr).toContain(`blocked: refusing to modify codex marketplace config in another git worktree: ${config}\n`);
    expect(fix.stdout).not.toContain("registered codex");
    expect(h.cliLog()).not.toContain("codex ");
    expect(h.cliLog()).toContain("claude plugin marketplace add ");
  });

  it("tells a Cursor agent where the profile is and does not install skills on the VM", () => {
    const h = host();
    mkdirSync(join(h.home, ".cursor"));
    mkdirSync(join(h.home, "repo"));

    const fix = h.run("--fix", { CURSOR_AGENT: "1" });
    expect(fix.status).toBe(0);
    expect(fix.stdout).toContain(`${CURSOR_READ}\n`);
    expect(fix.stdout).toContain(`${CURSOR_SKILLS}\n`);
    expect(fix.stdout).toContain("cursor: User Rules live in Cursor Settings, not in a file this installer can write.\n");
    expect(fix.stdout).toContain("cursor: Cloud Agents do not load skills written on this VM.");
    expect(fix.stdout).toContain("skipped: codex CLI is not installed\n");
    expect(fix.stdout).not.toContain("registered");
    expect(existsSync(join(h.home, ".cursor", "skills"))).toBe(false);
    expect(existsSync(join(h.home, "repo", "AGENTS.md"))).toBe(false);
    expect(existsSync(join(h.home, "AGENTS.md"))).toBe(false);
    expect(readlinkSync(join(h.home, ".codex", "AGENTS.md"))).toBe(SOURCE);
  });

  it("links Cursor IDE skills into ~/.cursor/skills without copying AGENTS.md", () => {
    const h = host();
    mkdirSync(join(h.home, ".cursor"));

    const fix = h.run("--fix");
    expect(fix.status).toBe(0);
    expect(fix.stdout).toContain(`${CURSOR_READ}\n`);
    expect(fix.stdout).toContain(`${CURSOR_SKILLS}\n`);
    expect(fix.stdout).not.toContain("Cloud Agents do not load skills");
    expect(readlinkSync(join(h.home, ".cursor", "skills", "agent-workflows"))).toBe(WORKFLOW_SKILLS);
    expect(readlinkSync(join(h.home, ".cursor", "skills", "engineering-practices"))).toBe(PRACTICE_SKILLS);
    expect(existsSync(join(h.home, ".cursor", "skills", "agent-workflows", "done", "SKILL.md"))).toBe(true);
    expect(existsSync(join(h.home, "AGENTS.md"))).toBe(false);

    const again = h.run("--fix");
    expect(again.status).toBe(0);
    expect(again.stdout).toContain("ok: Cursor skills agent-workflows ->");
    expect(again.stdout).toContain("ok: Cursor skills engineering-practices ->");
  });
});
