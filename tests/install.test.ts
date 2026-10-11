import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
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

function host() {
  const home = mkdtempSync(join(tmpdir(), "install-sh-"));
  const bin = join(home, "bin");
  const state = join(home, "state");
  const log = join(home, "cli.log");
  mkdirSync(bin);
  const run = (mode: "--check" | "--fix", extra: Record<string, string> = {}) => {
    const result = spawnSync("/bin/bash", [SCRIPT, mode], {
      env: {
        PATH: `${bin}:/usr/bin:/bin`,
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

function stubClis(bin: string) {
  const script = join(bin, "marketplace-stub");
  writeFileSync(script, STUB);
  chmodSync(script, 0o755);
  symlinkSync(script, join(bin, "codex"));
  symlinkSync(script, join(bin, "claude"));
}

describe("install.sh", () => {
  it("reports a missing CLI and does not call it registered", () => {
    const h = host();

    const check = h.run("--check");
    expect(check.status).toBe(1);
    expect(check.stdout).toContain("missing-tool: cannot check codex marketplace; requires codex\n");
    expect(check.stdout).toContain("missing-tool: cannot check claude marketplace; requires claude\n");
    expect(check.stdout).not.toContain("marketplace registered");
    expect(check.stdout).not.toContain("marketplace is not registered");
    expect(check.stderr).not.toContain("command not found");
    expect(existsSync(join(h.home, ".codex", "AGENTS.md"))).toBe(false);
    expect(existsSync(join(h.home, ".claude", "CLAUDE.md"))).toBe(false);

    const fix = h.run("--fix");
    expect(fix.status).toBe(1);
    expect(fix.stdout).not.toContain("registered");
    expect(fix.stderr).toContain("blocked: cannot register codex marketplace; requires codex\n");
    expect(fix.stderr).toContain("blocked: cannot register claude marketplace; requires claude\n");
    expect(fix.stderr).not.toContain("command not found");
    expect(readlinkSync(join(h.home, ".codex", "AGENTS.md"))).toBe(SOURCE);
    expect(readlinkSync(join(h.home, ".claude", "CLAUDE.md"))).toBe(SOURCE);

    const again = h.run("--fix");
    expect(again.status).toBe(1);
    expect(again.stdout).not.toContain("registered");
    expect(again.stderr).toContain("blocked: cannot register codex marketplace; requires codex\n");
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
});
