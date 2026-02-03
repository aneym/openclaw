import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSessionRunning,
  consumeInterruptedSessions,
  getRunningSessionKeys,
  markSessionRunning,
  resolveRunningSessionsPath,
} from "./running-sessions.js";

describe("running-sessions", () => {
  let prevStateDir: string | undefined;
  let tempDir: string;

  beforeEach(async () => {
    prevStateDir = process.env.OPENCLAW_STATE_DIR;
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "openclaw-running-sessions-"));
    process.env.OPENCLAW_STATE_DIR = tempDir;
  });

  afterEach(async () => {
    if (prevStateDir) {
      process.env.OPENCLAW_STATE_DIR = prevStateDir;
    } else {
      delete process.env.OPENCLAW_STATE_DIR;
    }
    await fsp.rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("markSessionRunning writes state file with correct data", () => {
    markSessionRunning({
      sessionKey: "agent:main:whatsapp:dm:+15555550001",
      sessionId: "session-abc",
      runId: "run-xyz",
    });

    const filePath = resolveRunningSessionsPath();
    expect(fs.existsSync(filePath)).toBe(true);

    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.version).toBe(1);
    expect(parsed.sessions["agent:main:whatsapp:dm:+15555550001"]).toMatchObject({
      sessionId: "session-abc",
      runId: "run-xyz",
      pid: process.pid,
    });
    expect(typeof parsed.sessions["agent:main:whatsapp:dm:+15555550001"].startedAt).toBe("number");
  });

  it("clearSessionRunning removes entry from file", () => {
    markSessionRunning({
      sessionKey: "agent:main:telegram:dm:123",
      sessionId: "session-1",
      runId: "run-1",
    });

    clearSessionRunning("agent:main:telegram:dm:123");

    const filePath = resolveRunningSessionsPath();
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.sessions).toEqual({});
  });

  it("clearSessionRunning is a no-op for unknown keys", () => {
    // Should not throw even when file doesn't exist
    clearSessionRunning("agent:nonexistent:key");
  });

  it("consumeInterruptedSessions returns entries and clears file", () => {
    // Write entries with a dead PID (PID 1 is init, but a very high PID should be dead)
    const filePath = resolveRunningSessionsPath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        version: 1,
        sessions: {
          "agent:main:whatsapp:dm:+15555550001": {
            sessionId: "session-a",
            runId: "run-a",
            startedAt: 1706745600000,
            pid: 999999999, // almost certainly dead
          },
        },
      }),
    );

    const interrupted = consumeInterruptedSessions();
    expect(interrupted).toHaveLength(1);
    expect(interrupted[0]).toMatchObject({
      sessionKey: "agent:main:whatsapp:dm:+15555550001",
      sessionId: "session-a",
      runId: "run-a",
      pid: 999999999,
    });

    // File should be cleared
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.sessions).toEqual({});
  });

  it("consumeInterruptedSessions skips entries with alive PIDs", () => {
    const filePath = resolveRunningSessionsPath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        version: 1,
        sessions: {
          "agent:main:alive": {
            sessionId: "session-alive",
            runId: "run-alive",
            startedAt: Date.now(),
            pid: process.pid, // current process = alive
          },
          "agent:main:dead": {
            sessionId: "session-dead",
            runId: "run-dead",
            startedAt: Date.now(),
            pid: 999999999, // dead
          },
        },
      }),
    );

    const interrupted = consumeInterruptedSessions();
    expect(interrupted).toHaveLength(1);
    expect(interrupted[0].sessionKey).toBe("agent:main:dead");
  });

  it("tracks multiple concurrent sessions independently", () => {
    markSessionRunning({
      sessionKey: "agent:main:whatsapp:dm:+15555550001",
      sessionId: "session-1",
      runId: "run-1",
    });
    markSessionRunning({
      sessionKey: "agent:main:telegram:dm:456",
      sessionId: "session-2",
      runId: "run-2",
    });
    markSessionRunning({
      sessionKey: "agent:main:discord:dm:789",
      sessionId: "session-3",
      runId: "run-3",
    });

    const keys = getRunningSessionKeys();
    expect(keys).toHaveLength(3);
    expect(keys).toContain("agent:main:whatsapp:dm:+15555550001");
    expect(keys).toContain("agent:main:telegram:dm:456");
    expect(keys).toContain("agent:main:discord:dm:789");

    // Clear one
    clearSessionRunning("agent:main:telegram:dm:456");
    const keysAfter = getRunningSessionKeys();
    expect(keysAfter).toHaveLength(2);
    expect(keysAfter).not.toContain("agent:main:telegram:dm:456");
  });

  it("handles corrupted file gracefully", () => {
    const filePath = resolveRunningSessionsPath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "not-json-at-all", "utf-8");

    // Should not throw, returns empty
    const interrupted = consumeInterruptedSessions();
    expect(interrupted).toEqual([]);

    const keys = getRunningSessionKeys();
    expect(keys).toEqual([]);
  });

  it("handles missing file gracefully", () => {
    const interrupted = consumeInterruptedSessions();
    expect(interrupted).toEqual([]);

    const keys = getRunningSessionKeys();
    expect(keys).toEqual([]);
  });

  it("handles file with wrong version gracefully", () => {
    const filePath = resolveRunningSessionsPath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ version: 99, sessions: {} }), "utf-8");

    const keys = getRunningSessionKeys();
    expect(keys).toEqual([]);
  });

  it("getRunningSessionKeys returns empty array when no sessions", () => {
    const keys = getRunningSessionKeys();
    expect(keys).toEqual([]);
  });

  it("markSessionRunning overwrites entry for same sessionKey", () => {
    markSessionRunning({
      sessionKey: "agent:main:test",
      sessionId: "session-old",
      runId: "run-old",
    });
    markSessionRunning({
      sessionKey: "agent:main:test",
      sessionId: "session-new",
      runId: "run-new",
    });

    const keys = getRunningSessionKeys();
    expect(keys).toHaveLength(1);

    const filePath = resolveRunningSessionsPath();
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.sessions["agent:main:test"].sessionId).toBe("session-new");
  });
});
