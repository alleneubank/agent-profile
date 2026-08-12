import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import agentProfile from "../extensions/pi-hooks";

interface BashCall {
  toolName: string;
  toolCallId: string;
  input: { command: string };
}

type Handler = (event: unknown, ctx: { cwd: string }) => unknown;

function makeStub() {
  const handlers = new Map<string, Handler>();
  const sendMessage = vi.fn();
  const pi = {
    on: (_name: string, fn: Handler) => {
      handlers.set(_name, fn);
    },
    sendMessage,
  };
  return { pi: pi as unknown as ExtensionAPI, handlers, sendMessage };
}

function bashCall(command: string): BashCall {
  return { toolName: "bash", toolCallId: "t1", input: { command } };
}

describe("pi-hooks extension: registration", () => {
  it("registers session_start and tool_call handlers", () => {
    const { pi, handlers } = makeStub();
    agentProfile(pi);
    expect(handlers.has("session_start")).toBe(true);
    expect(handlers.has("tool_call")).toBe(true);
  });
});

describe("instruction fingerprint (session_start)", () => {
  it("emits an instruction-fingerprint custom message", async () => {
    const { pi, handlers, sendMessage } = makeStub();
    agentProfile(pi);
    const handler = handlers.get("session_start")!;
    await handler({ reason: "startup" }, { cwd: process.cwd() });

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        customType: "instruction-fingerprint",
        display: true,
      }),
    );
    const message = sendMessage.mock.calls[0][0] as { content: string };
    expect(message.content).toMatch(/^instruction-fingerprint: /);
  });

  it("silently degrades when the script cannot run (never blocks startup)", async () => {
    const { pi, handlers, sendMessage } = makeStub();
    agentProfile(pi);
    const handler = handlers.get("session_start")!;
    await handler({ reason: "startup" }, { cwd: "/nonexistent-dir" });
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe("verifier-bypass guard (tool_call)", () => {
  it("blocks git --no-verify with the script's reason", async () => {
    const { pi, handlers } = makeStub();
    agentProfile(pi);
    const handler = handlers.get("tool_call")!;
    const result = (await handler(bashCall("git commit --no-verify"), {
      cwd: process.cwd(),
    })) as { block: boolean; reason: string } | undefined;

    expect(result).toEqual(expect.objectContaining({ block: true }));
    expect(result!.reason).toContain("--no-verify");
  });

  it("blocks hooksPath=/dev/null", async () => {
    const { pi, handlers } = makeStub();
    agentProfile(pi);
    const handler = handlers.get("tool_call")!;
    const result = (await handler(
      bashCall("git -c core.hooksPath=/dev/null commit"),
      { cwd: process.cwd() },
    )) as { block: boolean } | undefined;

    expect(result).toEqual(expect.objectContaining({ block: true }));
  });

  it("allows the HOOK_BYPASS_APPROVED escape hatch", async () => {
    const { pi, handlers } = makeStub();
    agentProfile(pi);
    const handler = handlers.get("tool_call")!;
    const result = await handler(
      bashCall("HOOK_BYPASS_APPROVED=1 git commit --no-verify"),
      { cwd: process.cwd() },
    );
    expect(result).toBeUndefined();
  });

  it("allows ordinary commands", async () => {
    const { pi, handlers } = makeStub();
    agentProfile(pi);
    const handler = handlers.get("tool_call")!;
    expect(
      await handler(bashCall("git status"), { cwd: process.cwd() }),
    ).toBeUndefined();
    expect(
      await handler(bashCall("ls -la"), { cwd: process.cwd() }),
    ).toBeUndefined();
  });

  it("ignores non-bash tool calls", async () => {
    const { pi, handlers } = makeStub();
    agentProfile(pi);
    const handler = handlers.get("tool_call")!;
    const result = await handler(
      { toolName: "read", toolCallId: "t2", input: { path: "/x" } },
      { cwd: process.cwd() },
    );
    expect(result).toBeUndefined();
  });

  it("fails open when the guard cannot run (no block)", async () => {
    const { pi, handlers } = makeStub();
    agentProfile(pi);
    const handler = handlers.get("tool_call")!;
    const result = await handler(bashCall("true"), {
      cwd: "/nonexistent-dir/wat",
    });
    expect(result).toBeUndefined();
  });
});
