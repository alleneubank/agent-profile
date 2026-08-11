/**
 * pi-native hooks for the agent-profile plugins.
 *
 * pi has no hooks.json consumer, so this extension is the consumer: it maps
 * the plugin's Claude/Codex hook events onto pi's in-process events and runs
 * the canonical shell scripts — never an inline copy of hook policy.
 *
 *   hooks.json SessionStart            -> session_start  (instruction fingerprint)
 *   hooks.json PreToolUse (Bash/shell) -> tool_call      (verifier-bypass guard)
 *   hooks.json SubagentStart           -> (skipped: pi has no native subagents)
 *
 * Both hooks fail open by design: a script error, timeout, missing output, or
 * parse failure never blocks a tool call or pi startup (SPEC REQ-PI-002/003/004).
 */
import { isToolCallEventType, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HOOKS_DIR = fileURLToPath(
  new URL("../plugins/agent-workflows/hooks", import.meta.url),
);
const FINGERPRINT_SCRIPT = `${HOOKS_DIR}/instruction-fingerprint.sh`;
const GUARD_SCRIPT = `${HOOKS_DIR}/verifier-bypass-guard.sh`;

/** Matching hooks.json timeouts; hard bounds so a hook can never hang pi. */
const FINGERPRINT_TIMEOUT_MS = 10_000;
const GUARD_TIMEOUT_MS = 5_000;
/** Cap hook stdout so a noisy script cannot balloon memory. */
const MAX_STDOUT_BYTES = 64 * 1024;

interface HookResult {
  stdout: string;
  code: number;
  timedOut: boolean;
}

interface HookSpecificOutput {
  hookEventName?: string;
  additionalContext?: string;
  permissionDecision?: string;
  permissionDecisionReason?: string;
}

interface HookOutput {
  hookSpecificOutput?: HookSpecificOutput;
}

/** Run a hook script with stdin JSON, bounded, fail-open (never rejects). */
function runHook(
  script: string,
  args: string[],
  input: string | undefined,
  cwd: string,
  timeoutMs: number,
): Promise<HookResult> {
  return new Promise((resolve) => {
    const child = spawn("bash", [script, ...args], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let settled = false;

    const timer = setTimeout(() => {
      settled = true;
      child.kill("SIGKILL");
      resolve({ stdout, code: -1, timedOut: true });
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < MAX_STDOUT_BYTES) {
        stdout += chunk.toString("utf8").slice(0, MAX_STDOUT_BYTES - stdout.length);
      }
    });
    child.stderr.on("data", () => {
      /* stderr is diagnostic noise; the stdout JSON contract is the signal. */
    });
    child.on("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, code: -1, timedOut: false });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, code: code ?? -1, timedOut: false });
    });

    if (input !== undefined) child.stdin.write(input);
    child.stdin.end();
  });
}

/** Parse the hook's single JSON object out of stdout, tolerantly. */
function parseHookOutput(stdout: string): HookOutput | null {
  const text = stdout.trim();
  if (text === "") return null;
  const start = text.indexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(text.slice(start)) as HookOutput;
  } catch {
    return null;
  }
}

export default function agentProfilePiHooks(pi: ExtensionAPI): void {
  // SessionStart -> instruction fingerprint, stamped into the transcript so
  // sessions stay bucketable by instruction version (eval skill A/B input).
  pi.on("session_start", async (_event, ctx) => {
    try {
      const result = await runHook(
        FINGERPRINT_SCRIPT,
        ["SessionStart"],
        undefined,
        ctx.cwd,
        FINGERPRINT_TIMEOUT_MS,
      );
      const context = parseHookOutput(result.stdout)?.hookSpecificOutput
        ?.additionalContext;
      if (result.timedOut || context === undefined) return;
      pi.sendMessage({
        customType: "instruction-fingerprint",
        content: context,
        display: true,
      });
    } catch {
      // Never let a hook break session start.
    }
  });

  // PreToolUse (Bash) -> verifier-bypass guard. The script reads the command
  // from stdin and answers a deny JSON for the two bypass shapes it polices.
  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return;
    const command = event.input.command ?? "";
    const payload = JSON.stringify({ tool_input: { command } });
    const result = await runHook(
      GUARD_SCRIPT,
      [],
      payload,
      ctx.cwd,
      GUARD_TIMEOUT_MS,
    );
    if (result.timedOut || result.code !== 0) return; // fail open
    const deny = parseHookOutput(result.stdout)?.hookSpecificOutput;
    if (deny?.permissionDecision === "deny") {
      return {
        block: true,
        reason:
          deny.permissionDecisionReason ?? "Blocked by verifier-bypass-guard hook",
      };
    }
    return undefined;
  });
}
