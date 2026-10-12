import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = resolve(__dirname, "../plugins/agent-workflows/skills/git-worktree-tidy/scripts/worktree.sh");
const scratch: string[] = [];
afterEach(() => { for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true }); });

function fixture() {
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
  };
  function git(...args: string[]) {
    const result = spawnSync("git", args, { cwd: repo, env, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout;
  }
  git("init", "-q");
  git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "initial", "--allow-empty");
  git("config", "gc.worktreePruneExpire", "now");
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
  git("worktree", "add", "-q", "--detach", worktree, "HEAD");
  function run(...args: string[]) {
    const result = spawnSync("/bin/bash", [SCRIPT, ...args], { cwd: repo, env, encoding: "utf8", timeout: 20000 });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  }
  function report(path = worktree) {
    const result = run("check", path);
    return { ...result, row: JSON.parse(result.stdout) };
  }
  return { home, repo, bin, env, worktree, git, sox, zmx, run, report };
}

async function processIn(cwd: string) {
  const child = spawn("/bin/sh", ["-c", "printf ready; exec sleep 60"], { cwd });
  const closed = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", () => resolve());
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("process did not become ready")), 2000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.stdout.once("data", () => { clearTimeout(timer); resolve(); });
  });
  return { pid: child.pid, stop: async () => { child.kill("SIGTERM"); await closed; } };
}

describe("worktree owner guard", () => {
  it("refuses removal, including force, with a process in a descendant; removes after it stops", async () => {
    const f = fixture();
    const nested = join(f.worktree, "nested");
    mkdirSync(nested);
    const owner = await processIn(nested);
    try {
      const observed = f.report();
      expect(observed.status).toBe(3);
      expect(observed.row.status).toBe("at-risk");
      expect(observed.row.owners).toContainEqual({ kind: "process", pid: owner.pid, command: "sleep", directory: nested });
      expect(f.run("remove", f.worktree).status).toBe(3);
      expect(f.run("remove", f.worktree, "--force").status).toBe(3);
      expect(existsSync(f.worktree)).toBe(true);
    } finally { await owner.stop(); }
    rmSync(nested, { recursive: true });
    expect(f.report().row.status).toBe("clear");
    expect(f.run("remove", f.worktree).status).toBe(0);
    expect(existsSync(f.worktree)).toBe(false);
  });

  it("matches physical paths through symlinks without matching a sibling prefix", async () => {
    const f = fixture();
    const sibling = `${f.worktree}-other`;
    mkdirSync(sibling);
    const link = join(f.home, "alias");
    symlinkSync(f.worktree, link);
    const owner = await processIn(sibling);
    try {
      expect(f.report(link).row.status).toBe("clear");
      expect(f.report(sibling).row.owners.map((o: { pid: number }) => o.pid)).toContain(owner.pid);
    } finally { await owner.stop(); }
  });

  it("lists sox owners with labels and zmx initial directories even after the shell changes cwd", () => {
    const f = fixture();
    mkdirSync(join(f.env.SOX_HOME, "zmx"), { recursive: true });
    f.sox([
      { kind: "shell", host: null, backing_id: "s3.g7", cwd: f.worktree, status: "live", labels: { owner: "demo" } },
      { kind: "shell", host: "remote", backing_id: "s9.g2", cwd: f.worktree, status: "live" },
      { kind: "shell", host: "localhost", backing_id: "s4.g8", cwd: f.repo, status: "live" },
    ]);
    writeFileSync(join(f.home, "backings.txt"),
      `  name=s4.g8\tpid=456\tclients=0\tcwd=file://host${f.worktree.replaceAll(" ", "%20")}\tcmd=sleep\n`);
    f.zmx(`→ name=dev\tpid=123\tstart_dir=${f.worktree}\tcmd=sh\n`);
    const result = f.report();
    expect(result.status).toBe(3);
    expect(result.row.owners).toEqual(expect.arrayContaining([
      { kind: "session", tool: "sox", home: f.env.SOX_HOME, target: "s3.g7", state: "live", labels: { owner: "demo" }, directory: f.worktree },
      { kind: "session", tool: "zmx", namespace: join(f.env.SOX_HOME, "zmx"), target: "s4.g8", pid: "456", directory: f.worktree },
      { kind: "session", tool: "zmx", namespace: f.env.ZMX_DIR, target: "dev", pid: "123", directory: f.worktree },
    ]));
    expect(result.row.owners).toHaveLength(3);
    expect(f.run("remove", f.worktree).status).toBe(3);
  });

  it("refuses prune with a deleted process cwd, then prunes after that process stops", async () => {
    const f = fixture();
    const owner = await processIn(f.worktree);
    rmSync(f.worktree, { recursive: true });
    try {
      const result = f.run("prune");
      expect(result.status).toBe(3);
      expect(JSON.parse(result.stdout).owners.map((o: { pid: number }) => o.pid)).toContain(owner.pid);
      expect(f.git("worktree", "list", "--porcelain")).toContain(f.worktree);
    } finally { await owner.stop(); }
    expect(f.run("prune").status).toBe(0);
    expect(f.git("worktree", "list", "--porcelain")).not.toContain(f.worktree);
    expect(f.run("prune").status).toBe(0);
  });

  it("refuses the entire prune batch when a session still owns one missing worktree", () => {
    const f = fixture();
    const other = join(f.home, "other");
    f.git("worktree", "add", "-q", "--detach", other, "HEAD");
    rmSync(f.worktree, { recursive: true });
    rmSync(other, { recursive: true });
    f.zmx(`  name=dev\tpid=123\tstart_dir=${f.worktree}\tcmd=sh\n`);
    expect(f.run("prune").status).toBe(3);
    expect(f.git("worktree", "list", "--porcelain")).toContain(other);
    f.zmx();
    expect(f.run("prune").status).toBe(0);
    expect(f.git("worktree", "list", "--porcelain")).not.toContain(other);
  });

  it.each(["partial", "zero hosts", "malformed", "no cwd"])("treats a %s sox inventory as unknown, never as empty", (failure) => {
    const f = fixture();
    if (failure === "partial") f.sox([], false);
    if (failure === "zero hosts") writeFileSync(join(f.home, "sox.jsonl"), '{"kind":"summary","complete":true,"has_more":false,"hosts_answered":0}\n');
    if (failure === "malformed") writeFileSync(join(f.home, "sox.jsonl"), "broken\n");
    if (failure === "no cwd") f.sox([{ kind: "shell", host: null, backing_id: "s3.g7", cwd: null }]);
    expect(f.report().row.status).toBe("unknown");
    expect(f.run("remove", f.worktree, "--force").status).toBe(4);
    expect(existsSync(f.worktree)).toBe(true);
    rmSync(f.worktree, { recursive: true });
    expect(f.run("prune").status).toBe(4);
    expect(f.git("worktree", "list", "--porcelain")).toContain(f.worktree);
  });

  it("refuses an unrecognized, empty or failing zmx response", () => {
    const f = fixture();
    for (const text of ["", "session dev\n", "  name=dev\tpid=123\tcmd=sh\n"]) {
      f.zmx(text);
      expect(f.run("remove", f.worktree).status).toBe(4);
      expect(existsSync(f.worktree)).toBe(true);
    }
    writeFileSync(join(f.bin, "zmx"), '#!/bin/bash\necho daemon-unreachable >&2\nexit 1\n');
    expect(f.report().row.errors.join(" ")).toContain("daemon-unreachable");
  });

  it("refuses an incomplete process inventory and understands the BSD lsof field format", () => {
    const f = fixture();
    const lsof = join(f.bin, "lsof");
    writeFileSync(lsof, '#!/bin/bash\nprintf "p%s\\0cchecker\\0\\nn%s\\0\\np456\\0cserver\\0\\nn%s\\0\\n" "$PPID" "$PWD" "$HOME/work tree"\n');
    chmodSync(lsof, 0o755);
    const result = f.report();
    expect(result.status).toBe(3);
    expect(result.row.owners).toContainEqual({ kind: "process", pid: 456, command: "server", directory: f.worktree });
    writeFileSync(lsof, '#!/bin/bash\nprintf "p456\\0cserver\\0\\nn%s\\0\\n" "$HOME/work tree"\n');
    expect(f.run("remove", f.worktree).status).toBe(4);
    expect(existsSync(f.worktree)).toBe(true);
  });

  it("accepts zmx's real empty inventory on stderr and rejects unknown targets and bad usage", () => {
    const f = fixture();
    writeFileSync(join(f.bin, "zmx"), '#!/bin/bash\necho "no sessions found in $ZMX_DIR" >&2\n');
    expect(f.report().row.status).toBe("clear");
    expect(f.run("remove", join(f.home, "absent")).status).toBe(4);
    expect(f.run("check").status).toBe(2);
    expect(f.run("remove", f.worktree, "--ignore-owners").status).toBe(2);
    expect(readFileSync(join(f.worktree, ".git"), "utf8")).toContain("gitdir:");
  });
});
