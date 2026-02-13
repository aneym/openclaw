import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isCodingAgentCommand, maybeRegisterCodingSession } from "./coding-session-detect.js";

const ORIGINAL_WORKSPACE = process.env.OPENCLAW_WORKSPACE;

function readSessionState(workspaceDir: string) {
  const statePath = path.join(workspaceDir, "state", "coding-sessions.json");
  if (!existsSync(statePath)) {
    return undefined;
  }
  return JSON.parse(readFileSync(statePath, "utf-8")) as { sessions?: Record<string, unknown> };
}

describe("coding session detection", () => {
  let workspaceDir: string | null = null;

  afterEach(() => {
    process.env.OPENCLAW_WORKSPACE = ORIGINAL_WORKSPACE;
    if (workspaceDir) {
      rmSync(workspaceDir, { recursive: true, force: true });
      workspaceDir = null;
    }
  });

  it("detects supported coding agent commands", () => {
    expect(isCodingAgentCommand("codex run")).toBe(true);
    expect(isCodingAgentCommand("claude --print")).toBe(true);
    expect(isCodingAgentCommand("cc --resume")).toBe(true);
    expect(isCodingAgentCommand("kimi chat")).toBe(true);
    expect(isCodingAgentCommand("pnpm test")).toBe(false);
  });

  it("stores callback session and routing context for coding sessions", () => {
    workspaceDir = mkdtempSync(path.join(os.tmpdir(), "openclaw-coding-session-"));
    process.env.OPENCLAW_WORKSPACE = workspaceDir;

    maybeRegisterCodingSession("codex --model gpt-5", "exec-123", "/tmp/work", {
      sessionKey: "agent:main:main",
      channel: "telegram",
      to: "telegram:chat:123",
      threadId: "456",
      accountId: "acct-1",
    });

    const state = readSessionState(workspaceDir);
    const session = state?.sessions?.["coding-exec-123"] as Record<string, unknown> | undefined;
    expect(session).toBeDefined();
    expect(session?.sessionKey).toBe("agent:main:main");
    expect(session?.channel).toBe("telegram");
    expect(session?.to).toBe("telegram:chat:123");
    expect(session?.threadId).toBe("456");
    expect(session?.accountId).toBe("acct-1");
    expect(session?.deliveryContext).toEqual({
      channel: "telegram",
      to: "telegram:chat:123",
      threadId: "456",
      accountId: "acct-1",
    });
  });

  it("ignores non-coding commands", () => {
    workspaceDir = mkdtempSync(path.join(os.tmpdir(), "openclaw-coding-session-"));
    process.env.OPENCLAW_WORKSPACE = workspaceDir;

    maybeRegisterCodingSession("pnpm test", "exec-456", "/tmp/work", {
      sessionKey: "agent:main:main",
    });

    const state = readSessionState(workspaceDir);
    expect(state).toBeUndefined();
  });
});
