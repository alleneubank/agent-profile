import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ADAPTER = resolve(
  ROOT,
  "plugins/agent-workflows/hooks/agy-hook-adapter.sh",
);
const HOOKS_JSON = resolve(ROOT, "plugins/agent-workflows/hooks.json");

function runAdapter(event: string, stdin = ""): Record<string, unknown> {
  const stdout = execFileSync("/bin/bash", [ADAPTER, event], {
    input: stdin,
    encoding: "utf8",
    timeout: 10_000,
  });
  return JSON.parse(stdout) as Record<string, unknown>;
}

describe("agy hook manifest & adapter", () => {
  it("declares root hooks.json wiring SessionStart and PreToolUse to agy-hook-adapter.sh", () => {
    expect(existsSync(HOOKS_JSON)).toBe(true);
    const manifest = JSON.parse(readFileSync(HOOKS_JSON, "utf8")) as {
      "instruction-fingerprint"?: { SessionStart?: Array<{ command?: string }> };
      "verifier-bypass-guard"?: {
        PreToolUse?: Array<{
          matcher?: string;
          hooks?: Array<{ command?: string }>;
        }>;
      };
    };
    expect(
      manifest["instruction-fingerprint"]?.SessionStart?.[0]?.command,
    ).toBe("./hooks/agy-hook-adapter.sh SessionStart");
    const pre = manifest["verifier-bypass-guard"]?.PreToolUse?.[0];
    expect(pre?.matcher).toBe("run_command");
    expect(pre?.hooks?.[0]?.command).toBe(
      "./hooks/agy-hook-adapter.sh PreToolUse",
    );
  });

  it("SessionStart injects an instruction-fingerprint systemMessage", () => {
    const out = runAdapter(
      "SessionStart",
      JSON.stringify({ conversationId: "test-conv", modelName: "gemini-4-neon" }),
    );
    const steps = out.injectSteps as Array<{
      systemMessage?: { systemMessage?: string };
    }>;
    expect(Array.isArray(steps)).toBe(true);
    expect(steps[0]?.systemMessage?.systemMessage).toMatch(
      /^instruction-fingerprint: agent-profile@/,
    );
  });

  it("PreToolUse denies git --no-verify with the canonical reason", () => {
    const out = runAdapter(
      "PreToolUse",
      JSON.stringify({
        toolCall: {
          name: "run_command",
          args: { CommandLine: "git commit --no-verify -m x" },
        },
      }),
    );
    expect(out.decision).toBe("deny");
    expect(String(out.reason)).toContain("--no-verify");
  });

  it("PreToolUse denies core.hooksPath=/dev/null", () => {
    const out = runAdapter(
      "PreToolUse",
      JSON.stringify({
        toolCall: {
          name: "run_command",
          args: { CommandLine: "git -c core.hooksPath=/dev/null commit -m x" },
        },
      }),
    );
    expect(out.decision).toBe("deny");
    expect(String(out.reason)).toContain("hooksPath=/dev/null");
  });

  it("PreToolUse allows HOOK_BYPASS_APPROVED=1 escape hatch", () => {
    const out = runAdapter(
      "PreToolUse",
      JSON.stringify({
        toolCall: {
          name: "run_command",
          args: { CommandLine: "HOOK_BYPASS_APPROVED=1 git commit --no-verify" },
        },
      }),
    );
    expect(out).toEqual({ decision: "allow" });
  });

  it("PreToolUse allows ordinary commands and fails open on malformed stdin", () => {
    expect(
      runAdapter(
        "PreToolUse",
        JSON.stringify({
          toolCall: {
            name: "run_command",
            args: { CommandLine: "git status" },
          },
        }),
      ),
    ).toEqual({ decision: "allow" });

    expect(runAdapter("PreToolUse", "{not valid json")).toEqual({
      decision: "allow",
    });
  });
});
