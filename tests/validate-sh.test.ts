import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MISSING_RELEASE_COMMIT = "2d97990a5594e3344ac5076f97caee6272d67f79";
const MISSING_RELEASE_TAG = "engineering-practices-v1.11.0";

interface ValidateResult {
  status: number;
  stdout: string;
  stderr: string;
}

interface ExecFailure extends Error {
  status: number | null;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
}

function text(value: string | Buffer | undefined): string {
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return "";
}

function runValidate(cwd: string): ValidateResult {
  try {
    const stdout = execFileSync("bash", ["scripts/validate.sh"], {
      cwd,
      env: { ...process.env, PATH: join(cwd, ".validate-bin"), CODEX_VALIDATOR: "" },
      encoding: "utf8",
      timeout: 60_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    if (!(error instanceof Error) || !("status" in error)) throw error;
    const failed = error as ExecFailure;
    return {
      status: failed.status ?? 1,
      stdout: text(failed.stdout),
      stderr: text(failed.stderr),
    };
  }
}

function pluginVersion(plugin: string): string {
  const manifest = JSON.parse(
    readFileSync(
      join(ROOT, "plugins", plugin, ".claude-plugin", "plugin.json"),
      "utf8",
    ),
  ) as { version?: unknown };
  if (typeof manifest.version !== "string") {
    throw new Error(`${plugin} manifest has no version string`);
  }
  return manifest.version;
}

function cloneFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "validate-sh-"));
  try {
    execFileSync(
      "git",
      ["clone", "--local", "--no-hardlinks", "--quiet", ROOT, dir],
      { stdio: "ignore" },
    );
    execFileSync("git", ["remote", "remove", "origin"], {
      cwd: dir,
      stdio: "ignore",
    });
    cpSync(join(ROOT, "scripts/validate.sh"), join(dir, "scripts/validate.sh"));
    // Expose only the gate's dependencies, so optional host validators cannot run.
    const bin = join(dir, ".validate-bin");
    mkdirSync(bin);
    for (const command of ["bash", "dirname", "find", "git", "python3", "sort"]) {
      const executable = execFileSync(
        "bash",
        ["-c", 'command -v "$1"', "_", command],
        { encoding: "utf8" },
      ).trim();
      symlinkSync(executable, join(bin, command));
    }
    return dir;
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}

describe("validate.sh release-tag gate", () => {
  it("still checks skills when a required release tag is missing, and exits 1", () => {
    const dir = cloneFixture();
    try {
      const current = `engineering-practices-v${pluginVersion("engineering-practices")}`;
      execFileSync("git", ["tag", "-d", current], { cwd: dir, stdio: "ignore" });
      const result = runValidate(dir);
      expect(result.stderr).toContain(`missing tag ${current}`);
      expect(result.stdout).toContain("skill ok:");
      expect(result.stdout).toContain("skip: claude plugin validation");
      expect(result.status).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits 0 and reaches skill checks when every required release tag exists", () => {
    const dir = cloneFixture();
    try {
      const present = execFileSync("git", ["tag", "-l", MISSING_RELEASE_TAG], {
        cwd: dir,
        encoding: "utf8",
      }).trim();
      if (present.length === 0) {
        execFileSync("git", ["tag", MISSING_RELEASE_TAG, MISSING_RELEASE_COMMIT], {
          cwd: dir,
          stdio: "ignore",
        });
      }
      const result = runValidate(dir);
      expect(result.stderr).not.toContain("release tag check FAILED");
      expect(result.stdout).toContain("release tags ok");
      expect(result.stdout).toContain("skill ok:");
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
