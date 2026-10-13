import { execFile, spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PROCESS_TIMEOUT_MS } from "./process-timeout";

const SCRIPT = resolve(__dirname, "../plugins/agent-workflows/skills/git-worktree-tidy/scripts/worktree.sh");
// Owner scenarios issue several commands, each with its own process deadline.
const OWNER_TEST_TIMEOUT_MS = 2 * PROCESS_TIMEOUT_MS;
const scratch: string[] = [];
afterEach(() => { for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true }); });

async function fixture() {
  const home = mkdtempSync(join(tmpdir(), "worktree-owners-"));
  scratch.push(home);
  const repo = join(home, "repo");
  const bin = join(home, "bin");
  mkdirSync(repo);
  mkdirSync(bin);
  const env = {
    PATH: `${bin}:${process.env.PATH ?? "/usr/bin:/bin"}`, HOME: home,
    SOX_HOME: join(home, "sox-home"), SOX_BIN: join(bin, "sox"),
    ZMX_DIR: join(home, "zmx-home"), TMPDIR: home,
    WORKTREE_QUERY_TIMEOUT_SECONDS: String(PROCESS_TIMEOUT_MS / 1000),
  };
  function execute(command: string, args: string[]) {
    return new Promise<{ status: number; stdout: string; stderr: string }>((resolve, reject) => {
      execFile(command, args, { cwd: repo, env, encoding: "utf8", timeout: PROCESS_TIMEOUT_MS }, (error, stdout, stderr) => {
        const status = error ? error.code : 0;
        if (typeof status !== "number") reject(error);
        else resolve({ status, stdout, stderr });
      });
    });
  }
  async function git(...args: string[]) {
    const result = await execute("git", args);
    expect(result.status, result.stderr).toBe(0);
    return result.stdout;
  }
  await git("init", "-q");
  await git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "initial", "--allow-empty");
  await git("config", "gc.worktreePruneExpire", "now");
  for (const [tool, script] of Object.entries({
    sox: '#!/bin/bash\ncat "$HOME/sox.jsonl"\n',
    zmx: '#!/bin/bash\nif [ "$ZMX_DIR" = "$SOX_HOME/zmx" ]; then cat "$HOME/backings.txt"; else cat "$HOME/zmx.txt"; fi\n',
  })) {
    writeFileSync(join(bin, tool), script);
    chmodSync(join(bin, tool), 0o755);
  }
  function sox(rows: object[] = [], complete = true) {
    writeFileSync(join(home, "sox.jsonl"), [...rows, {
      kind: "summary", complete, has_more: false, hosts_answered: 1,
    }].map((r) => JSON.stringify(r)).join("\n") + "\n");
  }
  function zmx(text = `no sessions found in ${env.ZMX_DIR}\n`) {
    writeFileSync(join(home, "zmx.txt"), text);
  }
  sox();
  zmx();
  const worktree = join(home, "work tree");
  await git("worktree", "add", "-q", "--detach", worktree, "HEAD");
  function run(...args: string[]) {
    return execute("/bin/bash", [SCRIPT, ...args]);
  }
  async function report(path = worktree) {
    const result = await run("check", path);
    return { ...result, row: JSON.parse(result.stdout) };
  }
  return { home, repo, bin, env, worktree, git, sox, zmx, run, report };
}

async function processIn(cwd: string) {
  const child = spawn("/bin/sh", ["-c", `printf ready; exec sleep ${OWNER_TEST_TIMEOUT_MS / 1000}`], { cwd });
  const closed = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", () => resolve());
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("process did not become ready")), PROCESS_TIMEOUT_MS);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.stdout.once("data", () => { clearTimeout(timer); resolve(); });
  });
  return { pid: child.pid, stop: async () => { child.kill("SIGTERM"); await closed; } };
}

describe("worktree owner guard", { timeout: OWNER_TEST_TIMEOUT_MS }, () => {
  it("refuses removal when discovery times out and completes with a longer caller limit", async () => {
    const f = await fixture();
    writeFileSync(join(f.bin, "zmx"), `#!/bin/bash
exec python3 -c 'import os, time; time.sleep(0.2); print("no sessions found in " + os.environ["ZMX_DIR"])'
`);
    f.env.WORKTREE_QUERY_TIMEOUT_SECONDS = "0.05";
    const refused = await f.report();
    expect(refused.status).toBe(4);
    expect(refused.row.status).toBe("unknown");
    expect(refused.row.errors.join(" ")).toMatch(/zmx.*timed out/);
    expect((await f.run("remove", f.worktree, "--force")).status).toBe(4);
    expect(existsSync(f.worktree)).toBe(true);
    f.env.WORKTREE_QUERY_TIMEOUT_SECONDS = String(PROCESS_TIMEOUT_MS / 1000);
    expect((await f.report()).row.status).toBe("clear");
    expect((await f.run("remove", f.worktree)).status).toBe(0);
    expect(existsSync(f.worktree)).toBe(false);
  });

  it.each(["0", "-1", "nan", "inf", "301", "1e308", "invalid"])("refuses an invalid discovery timeout %s", async (timeout) => {
    const f = await fixture();
    f.env.WORKTREE_QUERY_TIMEOUT_SECONDS = timeout;
    const refused = await f.run("remove", f.worktree, "--force");
    expect(refused.status).toBe(4);
    expect(refused.stderr).toContain("WORKTREE_QUERY_TIMEOUT_SECONDS must be greater than zero and at most 300 seconds");
    expect(existsSync(f.worktree)).toBe(true);
  });

  it("checks local owners even when the fleet inventory is incomplete", async () => {
    const f = await fixture();
    writeFileSync(join(f.bin, "sox"), `#!/bin/bash
if [ "$1" = ls ] && [ "$2" = localhost ]; then
  cat "$HOME/sox.jsonl"
else
  echo '{"kind":"unreachable","host":"remote"}'
  echo '{"kind":"summary","complete":false,"has_more":false,"hosts_answered":1}'
fi
`);
    expect((await f.report()).row.status).toBe("clear");
    f.sox([{ kind: "shell", host: "localhost", backing_id: "s3.g7", cwd: f.worktree, status: "live" }]);
    const owned = await f.report();
    expect(owned.status).toBe(3);
    expect(owned.row.owners).toContainEqual({
      kind: "session", tool: "sox", target: "s3.g7", home: f.env.SOX_HOME,
      state: "live", labels: null, directory: f.worktree,
    });
    expect((await f.run("remove", f.worktree, "--force")).status).toBe(3);
    expect(existsSync(f.worktree)).toBe(true);
    f.sox();
    expect((await f.run("remove", f.worktree)).status).toBe(0);
    expect(existsSync(f.worktree)).toBe(false);
  });

  it("refuses removal, including force, with a process in a descendant; removes after it stops", async () => {
    const f = await fixture();
    const nested = join(f.worktree, "nested");
    mkdirSync(nested);
    const owner = await processIn(nested);
    try {
      const observed = await f.report();
      expect(observed.status).toBe(3);
      expect(observed.row.status).toBe("at-risk");
      expect(observed.row.owners).toContainEqual({ kind: "process", pid: owner.pid, command: "sleep", directory: nested });
      expect((await f.run("remove", f.worktree)).status).toBe(3);
      expect((await f.run("remove", f.worktree, "--force")).status).toBe(3);
      expect(existsSync(f.worktree)).toBe(true);
    } finally { await owner.stop(); }
    rmSync(nested, { recursive: true });
    expect((await f.report()).row.status).toBe("clear");
    expect((await f.run("remove", f.worktree)).status).toBe(0);
    expect(existsSync(f.worktree)).toBe(false);
  });

  it("matches physical paths through symlinks without matching a sibling prefix", async () => {
    const f = await fixture();
    const sibling = `${f.worktree}-other`;
    mkdirSync(sibling);
    const link = join(f.home, "alias");
    symlinkSync(f.worktree, link);
    const owner = await processIn(sibling);
    try {
      expect((await f.report(link)).row.status).toBe("clear");
      expect((await f.report(sibling)).row.owners.map((o: { pid: number }) => o.pid)).toContain(owner.pid);
    } finally { await owner.stop(); }
  });

  it("lists sox owners with labels and zmx initial directories even after the shell changes cwd", async () => {
    const f = await fixture();
    mkdirSync(join(f.env.SOX_HOME, "zmx"), { recursive: true });
    f.sox([
      { kind: "shell", host: null, backing_id: "s3.g7", cwd: f.worktree, status: "live", labels: { owner: "demo" } },
      { kind: "shell", host: "remote", backing_id: "s9.g2", cwd: f.worktree, status: "live" },
      { kind: "shell", host: "localhost", backing_id: "s4.g8", cwd: f.repo, status: "live" },
    ]);
    writeFileSync(join(f.home, "backings.txt"),
      `  name=s4.g8\tpid=456\tclients=0\tcwd=file://host${f.worktree.replaceAll(" ", "%20")}\tcmd=sleep\n`);
    f.zmx(`→ name=dev\tpid=123\tstart_dir=${f.worktree}\tcmd=sh\n`);
    const result = await f.report();
    expect(result.status).toBe(3);
    expect(result.row.owners).toEqual(expect.arrayContaining([
      { kind: "session", tool: "sox", home: f.env.SOX_HOME, target: "s3.g7", state: "live", labels: { owner: "demo" }, directory: f.worktree },
      { kind: "session", tool: "zmx", namespace: join(f.env.SOX_HOME, "zmx"), target: "s4.g8", pid: "456", directory: f.worktree },
      { kind: "session", tool: "zmx", namespace: f.env.ZMX_DIR, target: "dev", pid: "123", directory: f.worktree },
    ]));
    expect(result.row.owners).toHaveLength(3);
    expect((await f.run("remove", f.worktree)).status).toBe(3);
  });

  it("refuses prune with a deleted process cwd, then prunes after that process stops", async () => {
    const f = await fixture();
    const owner = await processIn(f.worktree);
    rmSync(f.worktree, { recursive: true });
    try {
      const result = await f.run("prune");
      expect(result.status).toBe(3);
      expect(JSON.parse(result.stdout).owners.map((o: { pid: number }) => o.pid)).toContain(owner.pid);
      expect(await f.git("worktree", "list", "--porcelain")).toContain(f.worktree);
    } finally { await owner.stop(); }
    expect((await f.run("prune")).status).toBe(0);
    expect(await f.git("worktree", "list", "--porcelain")).not.toContain(f.worktree);
    expect((await f.run("prune")).status).toBe(0);
  });

  it("refuses the entire prune batch when a session still owns one missing worktree", async () => {
    const f = await fixture();
    const other = join(f.home, "other");
    await f.git("worktree", "add", "-q", "--detach", other, "HEAD");
    rmSync(f.worktree, { recursive: true });
    rmSync(other, { recursive: true });
    f.zmx(`  name=dev\tpid=123\tstart_dir=${f.worktree}\tcmd=sh\n`);
    expect((await f.run("prune")).status).toBe(3);
    expect(await f.git("worktree", "list", "--porcelain")).toContain(other);
    f.zmx();
    expect((await f.run("prune")).status).toBe(0);
    expect(await f.git("worktree", "list", "--porcelain")).not.toContain(other);
  });

  it.each(["partial", "zero hosts", "malformed", "no cwd"])("treats a %s sox inventory as unknown, never as empty", async (failure) => {
    const f = await fixture();
    if (failure === "partial") f.sox([], false);
    if (failure === "zero hosts") writeFileSync(join(f.home, "sox.jsonl"), '{"kind":"summary","complete":true,"has_more":false,"hosts_answered":0}\n');
    if (failure === "malformed") writeFileSync(join(f.home, "sox.jsonl"), "broken\n");
    if (failure === "no cwd") f.sox([{ kind: "shell", host: null, backing_id: "s3.g7", cwd: null }]);
    expect((await f.report()).row.status).toBe("unknown");
    expect((await f.run("remove", f.worktree, "--force")).status).toBe(4);
    expect(existsSync(f.worktree)).toBe(true);
    rmSync(f.worktree, { recursive: true });
    expect((await f.run("prune")).status).toBe(4);
    expect(await f.git("worktree", "list", "--porcelain")).toContain(f.worktree);
  });

  it("refuses an unrecognized, empty or failing zmx response", async () => {
    const f = await fixture();
    for (const text of ["", "session dev\n", "  name=dev\tpid=123\tcmd=sh\n"]) {
      f.zmx(text);
      expect((await f.run("remove", f.worktree)).status).toBe(4);
      expect(existsSync(f.worktree)).toBe(true);
    }
    writeFileSync(join(f.bin, "zmx"), '#!/bin/bash\necho daemon-unreachable >&2\nexit 1\n');
    expect((await f.report()).row.errors.join(" ")).toContain("daemon-unreachable");
  });

  it("refuses an incomplete process inventory and understands the BSD lsof field format", async () => {
    const f = await fixture();
    const lsof = join(f.bin, "lsof");
    writeFileSync(lsof, '#!/bin/bash\nprintf "p%s\\0cchecker\\0\\nn%s\\0\\np456\\0cserver\\0\\nn%s\\0\\n" "$PPID" "$PWD" "$HOME/work tree"\n');
    chmodSync(lsof, 0o755);
    const result = await f.report();
    expect(result.status).toBe(3);
    expect(result.row.owners).toContainEqual({ kind: "process", pid: 456, command: "server", directory: f.worktree });
    writeFileSync(lsof, '#!/bin/bash\nprintf "p456\\0cserver\\0\\nn%s\\0\\n" "$HOME/work tree"\n');
    expect((await f.run("remove", f.worktree)).status).toBe(4);
    expect(existsSync(f.worktree)).toBe(true);
  });

  it("accepts zmx's real empty inventory on stderr and rejects unknown targets and bad usage", async () => {
    const f = await fixture();
    writeFileSync(join(f.bin, "zmx"), '#!/bin/bash\necho "no sessions found in $ZMX_DIR" >&2\n');
    expect((await f.report()).row.status).toBe("clear");
    expect((await f.run("remove", join(f.home, "absent"))).status).toBe(4);
    expect((await f.run("check")).status).toBe(2);
    expect((await f.run("remove", f.worktree, "--ignore-owners")).status).toBe(2);
    expect(readFileSync(join(f.worktree, ".git"), "utf8")).toContain("gitdir:");
  });
});
