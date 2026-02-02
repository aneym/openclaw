import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import { loadSessionStore, saveSessionStore } from "../../config/sessions.js";
import {
  maybeAutoTitleSession,
  extractTitleContext,
  parseTitleResponse,
  deriveClientSideTitle,
  _resetTitledSessions,
} from "./session-auto-title.js";

// Mock runAgent — we don't want to call Haiku in tests
vi.mock("../../agents/runtime-dispatcher.js", () => ({
  runAgent: vi.fn(),
}));

vi.mock("../../agents/agent-scope.js", () => ({
  resolveDefaultAgentId: () => "main",
  resolveAgentWorkspaceDir: () => "/tmp/workspace",
  resolveAgentDir: () => "/tmp/agentdir",
  resolveAgentIdFromSessionKey: () => "main",
}));

vi.mock("../../globals.js", () => ({
  logVerbose: vi.fn(),
}));

import { runAgent } from "../../agents/runtime-dispatcher.js";

const mockedRunAgent = vi.mocked(runAgent);

let tmpDir: string;
let storePath: string;
let sessionsDir: string;

beforeEach(async () => {
  tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "openclaw-autotitle-test-"));
  sessionsDir = path.join(tmpDir, "sessions");
  await fsPromises.mkdir(sessionsDir, { recursive: true });
  storePath = path.join(tmpDir, "sessions.json");
  _resetTitledSessions();
  mockedRunAgent.mockReset();
});

afterEach(async () => {
  await fsPromises.rm(tmpDir, { recursive: true, force: true });
});

function writeTranscript(sessionId: string, messages: Array<{ role: string; content: string }>) {
  const filePath = path.join(sessionsDir, `${sessionId}.jsonl`);
  const lines = messages.map((msg) =>
    JSON.stringify({ message: { role: msg.role, content: msg.content } }),
  );
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf-8");
  return filePath;
}

async function setupSession(
  sessionKey: string,
  sessionId: string,
  extra?: Partial<import("../../config/sessions.js").SessionEntry>,
) {
  const sessionFile = writeTranscript(sessionId, [
    { role: "user", content: "How do I fix my login page?" },
    { role: "assistant", content: "You can fix the login page by checking the auth middleware." },
  ]);
  await saveSessionStore(storePath, {
    [sessionKey]: {
      sessionId,
      sessionFile,
      updatedAt: Date.now(),
      ...extra,
    },
  });
  const store = loadSessionStore(storePath);
  return { sessionFile, entry: store[sessionKey] };
}

// ─── Skip conditions ─────────────────────────────────────────────────

describe("maybeAutoTitleSession skip conditions", () => {
  const cfg = { session: { store: storePath } } as OpenClawConfig;

  it("skips when session already has a label", async () => {
    const { entry, sessionFile } = await setupSession("agent:main:test", "s1", {
      label: "My Custom Title",
    });
    await maybeAutoTitleSession({
      sessionKey: "agent:main:test",
      storePath,
      sessionEntry: entry,
      sessionId: "s1",
      sessionFile,
      config: cfg,
    });
    expect(mockedRunAgent).not.toHaveBeenCalled();
  });

  it("still auto-titles when session has icon but no label", async () => {
    const { entry, sessionFile } = await setupSession("agent:main:test", "s2", {
      icon: "🔧",
    });
    mockedRunAgent.mockResolvedValue({
      payloads: [{ text: "🔧 Fix Login Page" }],
      meta: { agentMeta: {} },
    } as ReturnType<typeof runAgent> extends Promise<infer R> ? R : never);

    await maybeAutoTitleSession({
      sessionKey: "agent:main:test",
      storePath,
      sessionEntry: entry,
      sessionId: "s2",
      sessionFile,
      config: cfg,
    });
    expect(mockedRunAgent).toHaveBeenCalledTimes(1);
  });

  it("skips for subagent sessions", async () => {
    const { entry, sessionFile } = await setupSession("subagent:task1", "s3");
    await maybeAutoTitleSession({
      sessionKey: "subagent:task1",
      storePath,
      sessionEntry: entry,
      sessionId: "s3",
      sessionFile,
      config: cfg,
    });
    expect(mockedRunAgent).not.toHaveBeenCalled();
  });

  it("skips for temp sessions", async () => {
    const { entry, sessionFile } = await setupSession("temp:title-gen", "s4");
    await maybeAutoTitleSession({
      sessionKey: "temp:title-gen",
      storePath,
      sessionEntry: entry,
      sessionId: "s4",
      sessionFile,
      config: cfg,
    });
    expect(mockedRunAgent).not.toHaveBeenCalled();
  });

  it("skips for cron sessions", async () => {
    const { entry, sessionFile } = await setupSession("agent:main:cron:daily", "s5");
    await maybeAutoTitleSession({
      sessionKey: "agent:main:cron:daily",
      storePath,
      sessionEntry: entry,
      sessionId: "s5",
      sessionFile,
      config: cfg,
    });
    expect(mockedRunAgent).not.toHaveBeenCalled();
  });

  it("skips when no user messages exist", async () => {
    const sessionId = "s6";
    const sessionFile = writeTranscript(sessionId, [
      { role: "assistant", content: "Hello! How can I help?" },
    ]);
    await saveSessionStore(storePath, {
      ["agent:main:empty"]: { sessionId, sessionFile, updatedAt: Date.now() },
    });
    const store = loadSessionStore(storePath);
    const entry = store["agent:main:empty"];
    await maybeAutoTitleSession({
      sessionKey: "agent:main:empty",
      storePath,
      sessionEntry: entry,
      sessionId,
      sessionFile,
      config: cfg,
    });
    expect(mockedRunAgent).not.toHaveBeenCalled();
  });

  it("skips on second call for the same session (dedup)", async () => {
    const { entry, sessionFile } = await setupSession("agent:main:dedup", "s7");
    mockedRunAgent.mockResolvedValue({
      payloads: [{ text: "🔧 Fix Login Page" }],
      meta: { agentMeta: {} },
    } as ReturnType<typeof runAgent> extends Promise<infer R> ? R : never);

    await maybeAutoTitleSession({
      sessionKey: "agent:main:dedup",
      storePath,
      sessionEntry: entry,
      sessionId: "s7",
      sessionFile,
      config: cfg,
    });
    expect(mockedRunAgent).toHaveBeenCalledTimes(1);

    // Reset the mock call count but keep the implementation
    mockedRunAgent.mockClear();
    mockedRunAgent.mockResolvedValue({
      payloads: [{ text: "🔧 Fix Login Page" }],
      meta: { agentMeta: {} },
    } as ReturnType<typeof runAgent> extends Promise<infer R> ? R : never);

    // Second call — should be deduped
    await maybeAutoTitleSession({
      sessionKey: "agent:main:dedup",
      storePath,
      sessionEntry: entry,
      sessionId: "s7",
      sessionFile,
      config: cfg,
    });
    expect(mockedRunAgent).not.toHaveBeenCalled();
  });
});

// ─── extractTitleContext ─────────────────────────────────────────────

describe("extractTitleContext", () => {
  it("extracts user and assistant text from transcript", () => {
    const sessionId = "ctx-1";
    const sessionFile = writeTranscript(sessionId, [
      { role: "user", content: "How do I fix my login page?" },
      { role: "assistant", content: "Check the auth middleware and session handling." },
    ]);
    const result = extractTitleContext(sessionId, storePath, sessionFile);
    expect(result).not.toBeNull();
    expect(result!.earlyText.userText).toContain("fix my login page");
    expect(result!.earlyText.assistantText).toContain("auth middleware");
    expect(result!.exchangeCount).toBe(1);
  });

  it("returns null when transcript does not exist", () => {
    const result = extractTitleContext("nonexistent-session", storePath);
    expect(result).toBeNull();
  });

  it("returns null when there are no user messages", () => {
    const sessionId = "ctx-no-user";
    const sessionFile = writeTranscript(sessionId, [{ role: "assistant", content: "Hello!" }]);
    const result = extractTitleContext(sessionId, storePath, sessionFile);
    expect(result).toBeNull();
  });

  it("truncates long messages", () => {
    const sessionId = "ctx-long";
    const longText = "x".repeat(1000);
    const sessionFile = writeTranscript(sessionId, [
      { role: "user", content: longText },
      { role: "assistant", content: longText },
    ]);
    const result = extractTitleContext(sessionId, storePath, sessionFile);
    expect(result).not.toBeNull();
    expect(result!.earlyText.userText.length).toBeLessThanOrEqual(500);
    expect(result!.earlyText.assistantText.length).toBeLessThanOrEqual(300);
  });

  it("handles multiple user and assistant messages", () => {
    const sessionId = "ctx-multi";
    const sessionFile = writeTranscript(sessionId, [
      { role: "user", content: "First question" },
      { role: "assistant", content: "First answer" },
      { role: "user", content: "Second question" },
      { role: "assistant", content: "Second answer" },
    ]);
    const result = extractTitleContext(sessionId, storePath, sessionFile);
    expect(result).not.toBeNull();
    expect(result!.earlyText.userText).toContain("First question");
    expect(result!.earlyText.userText).toContain("Second question");
    expect(result!.earlyText.assistantText).toContain("First answer");
    expect(result!.earlyText.assistantText).toContain("Second answer");
    expect(result!.exchangeCount).toBe(2);
  });
});

// ─── parseTitleResponse ──────────────────────────────────────────────

describe("parseTitleResponse", () => {
  it("parses emoji + title format", () => {
    const result = parseTitleResponse("🔧 Fix Login Page Bug");
    expect(result).toEqual({ title: "Fix Login Page Bug", icon: "🔧" });
  });

  it("handles response with no emoji", () => {
    const result = parseTitleResponse("Fix Login Page Bug");
    expect(result).toEqual({ title: "Fix Login Page Bug", icon: "" });
  });

  it("returns null for empty string", () => {
    expect(parseTitleResponse("")).toBeNull();
  });

  it("handles emoji with no title text", () => {
    expect(parseTitleResponse("🔧")).toBeNull();
  });

  it("handles emoji with extra spaces", () => {
    const result = parseTitleResponse("🎨   Redesign Homepage");
    expect(result).toEqual({ title: "Redesign Homepage", icon: "🎨" });
  });

  it("handles multi-character emoji", () => {
    const result = parseTitleResponse("👨‍💻 Code Review Session");
    expect(result).toEqual({ title: "Code Review Session", icon: "👨‍💻" });
  });
});

// ─── deriveClientSideTitle ───────────────────────────────────────────

describe("deriveClientSideTitle", () => {
  it("extracts first sentence", () => {
    expect(deriveClientSideTitle("How do I fix my login page? It keeps failing.")).toBe(
      "How do I fix my login page?",
    );
  });

  it("truncates long sentences at word boundary", () => {
    const long =
      "This is a very long sentence that exceeds the forty character limit by quite a bit";
    const result = deriveClientSideTitle(long);
    expect(result.length).toBeLessThanOrEqual(41); // 40 + ellipsis
    expect(result).toContain("…");
  });

  it("returns empty string for empty input", () => {
    expect(deriveClientSideTitle("")).toBe("");
  });

  it("strips leading slash commands", () => {
    expect(deriveClientSideTitle("/help How do I use this?")).toBe("How do I use this?");
  });

  it("handles single-word input", () => {
    expect(deriveClientSideTitle("Hello")).toBe("Hello");
  });

  it("caps at 40 characters", () => {
    const result = deriveClientSideTitle("a".repeat(50));
    expect(result.length).toBeLessThanOrEqual(41); // 40 + ellipsis
  });
});

// ─── Title generation flow ───────────────────────────────────────────

describe("maybeAutoTitleSession title generation", () => {
  const cfg = { session: { store: storePath } } as OpenClawConfig;

  it("writes label + icon to session store on success", async () => {
    const { entry, sessionFile } = await setupSession("agent:main:success", "gen-1");
    mockedRunAgent.mockResolvedValue({
      payloads: [{ text: "🔧 Fix Login Page" }],
      meta: { agentMeta: {} },
    } as ReturnType<typeof runAgent> extends Promise<infer R> ? R : never);

    await maybeAutoTitleSession({
      sessionKey: "agent:main:success",
      storePath,
      sessionEntry: entry,
      sessionId: "gen-1",
      sessionFile,
      config: cfg,
    });

    const store = loadSessionStore(storePath);
    const updated = store["agent:main:success"];
    expect(updated.label).toBe("Fix Login Page");
    expect(updated.icon).toBe("🔧");
  });

  it("falls back to client-side heuristic when LLM fails", async () => {
    const { entry, sessionFile } = await setupSession("agent:main:fallback", "gen-2");
    mockedRunAgent.mockRejectedValue(new Error("API timeout"));

    await maybeAutoTitleSession({
      sessionKey: "agent:main:fallback",
      storePath,
      sessionEntry: entry,
      sessionId: "gen-2",
      sessionFile,
      config: cfg,
    });

    const store = loadSessionStore(storePath);
    const updated = store["agent:main:fallback"];
    expect(updated.label).toBeTruthy();
    // Heuristic derives from first user message
    expect(updated.label).toContain("fix my login page");
  });

  it("falls back when LLM returns empty response", async () => {
    const { entry, sessionFile } = await setupSession("agent:main:empty-llm", "gen-3");
    mockedRunAgent.mockResolvedValue({
      payloads: [{ text: "" }],
      meta: { agentMeta: {} },
    } as ReturnType<typeof runAgent> extends Promise<infer R> ? R : never);

    await maybeAutoTitleSession({
      sessionKey: "agent:main:empty-llm",
      storePath,
      sessionEntry: entry,
      sessionId: "gen-3",
      sessionFile,
      config: cfg,
    });

    const store = loadSessionStore(storePath);
    const updated = store["agent:main:empty-llm"];
    expect(updated.label).toBeTruthy();
  });

  it("does NOT overwrite label set between generation start and write", async () => {
    const { entry, sessionFile } = await setupSession("agent:main:race", "gen-4");

    // Simulate: LLM takes time, user renames session during that time
    mockedRunAgent.mockImplementation(async () => {
      // While "waiting" for LLM, user renames the session
      await saveSessionStore(storePath, {
        ["agent:main:race"]: {
          ...entry,
          label: "User Custom Title",
          icon: "⭐",
        },
      });
      return {
        payloads: [{ text: "🔧 Auto Generated Title" }],
        meta: { agentMeta: {} },
      } as ReturnType<typeof runAgent> extends Promise<infer R> ? R : never;
    });

    await maybeAutoTitleSession({
      sessionKey: "agent:main:race",
      storePath,
      sessionEntry: entry,
      sessionId: "gen-4",
      sessionFile,
      config: cfg,
    });

    // User's manual rename should be preserved
    const store = loadSessionStore(storePath);
    const updated = store["agent:main:race"];
    expect(updated.label).toBe("User Custom Title");
    expect(updated.icon).toBe("⭐");
  });
});

// ─── Error handling ──────────────────────────────────────────────────

describe("maybeAutoTitleSession error handling", () => {
  const cfg = { session: { store: storePath } } as OpenClawConfig;

  it("does not throw when LLM errors", async () => {
    const { entry, sessionFile } = await setupSession("agent:main:err1", "err-1");
    mockedRunAgent.mockRejectedValue(new Error("API down"));

    // Should not throw
    await expect(
      maybeAutoTitleSession({
        sessionKey: "agent:main:err1",
        storePath,
        sessionEntry: entry,
        sessionId: "err-1",
        sessionFile,
        config: cfg,
      }),
    ).resolves.toBeUndefined();
  });

  it("does not throw on store write failure", async () => {
    const { entry, sessionFile } = await setupSession("agent:main:err2", "err-2");
    mockedRunAgent.mockResolvedValue({
      payloads: [{ text: "🔧 Fix Bug" }],
      meta: { agentMeta: {} },
    } as ReturnType<typeof runAgent> extends Promise<infer R> ? R : never);

    // Make store path unwritable by pointing to a non-existent deeply nested path
    const badStorePath = path.join(tmpDir, "no", "such", "deep", "path", "sessions.json");

    await expect(
      maybeAutoTitleSession({
        sessionKey: "agent:main:err2",
        storePath: badStorePath,
        sessionEntry: entry,
        sessionId: "err-2",
        sessionFile,
        config: cfg,
      }),
    ).resolves.toBeUndefined();
  });

  it("cleans up temp session file even on error", async () => {
    const { entry, sessionFile } = await setupSession("agent:main:cleanup", "cleanup-1");

    // Track if mkdirSync was called to create a temp dir
    let tempDirCreated: string | null = null;
    mockedRunAgent.mockImplementation(async (params) => {
      // The session file should have been created
      tempDirCreated = path.dirname(params.sessionFile);
      throw new Error("LLM crashed");
    });

    await maybeAutoTitleSession({
      sessionKey: "agent:main:cleanup",
      storePath,
      sessionEntry: entry,
      sessionId: "cleanup-1",
      sessionFile,
      config: cfg,
    });

    // Temp dir should be cleaned up
    if (tempDirCreated) {
      expect(fs.existsSync(tempDirCreated)).toBe(false);
    }
  });
});
