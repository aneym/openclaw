import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InterruptedSession } from "../infra/running-sessions.js";

vi.mock("../infra/running-sessions.js", () => ({
  consumeInterruptedSessions: vi.fn(() => []),
}));

vi.mock("../infra/restart-sentinel.js", () => ({
  readRestartSentinel: vi.fn(async () => null),
}));

vi.mock("../infra/system-events.js", () => ({
  enqueueSystemEvent: vi.fn(),
}));

vi.mock("../infra/heartbeat-wake.js", () => ({
  requestHeartbeatNow: vi.fn(),
}));

// Import after mocks are set up
const { consumeInterruptedSessions } = await import("../infra/running-sessions.js");
const { readRestartSentinel } = await import("../infra/restart-sentinel.js");
const { enqueueSystemEvent } = await import("../infra/system-events.js");
const { requestHeartbeatNow } = await import("../infra/heartbeat-wake.js");
const { wakeInterruptedSessions } = await import("./server-interrupted-sessions.js");

describe("wakeInterruptedSessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing when no interrupted sessions", async () => {
    vi.mocked(consumeInterruptedSessions).mockReturnValue([]);

    await wakeInterruptedSessions();

    expect(enqueueSystemEvent).not.toHaveBeenCalled();
    expect(requestHeartbeatNow).not.toHaveBeenCalled();
  });

  it("enqueues system events for interrupted sessions", async () => {
    const sessions: InterruptedSession[] = [
      {
        sessionKey: "agent:main:whatsapp:dm:+15555550001",
        sessionId: "session-1",
        runId: "run-1",
        startedAt: Date.now(),
        pid: 12345,
      },
      {
        sessionKey: "agent:main:telegram:dm:789",
        sessionId: "session-2",
        runId: "run-2",
        startedAt: Date.now(),
        pid: 12345,
      },
    ];
    vi.mocked(consumeInterruptedSessions).mockReturnValue(sessions);
    vi.mocked(readRestartSentinel).mockResolvedValue(null);

    await wakeInterruptedSessions();

    expect(enqueueSystemEvent).toHaveBeenCalledTimes(2);
    expect(enqueueSystemEvent).toHaveBeenCalledWith(
      expect.stringContaining("interrupted by a gateway restart"),
      { sessionKey: "agent:main:whatsapp:dm:+15555550001" },
    );
    expect(enqueueSystemEvent).toHaveBeenCalledWith(
      expect.stringContaining("interrupted by a gateway restart"),
      { sessionKey: "agent:main:telegram:dm:789" },
    );
    expect(requestHeartbeatNow).toHaveBeenCalledWith({ reason: "interrupted-sessions" });
  });

  it("skips the restart sentinel session to avoid duplicate notifications", async () => {
    const sessions: InterruptedSession[] = [
      {
        sessionKey: "agent:main:whatsapp:dm:+15555550001",
        sessionId: "session-sentinel",
        runId: "run-sentinel",
        startedAt: Date.now(),
        pid: 12345,
      },
      {
        sessionKey: "agent:main:telegram:dm:789",
        sessionId: "session-other",
        runId: "run-other",
        startedAt: Date.now(),
        pid: 12345,
      },
    ];
    vi.mocked(consumeInterruptedSessions).mockReturnValue(sessions);
    vi.mocked(readRestartSentinel).mockResolvedValue({
      version: 1,
      payload: {
        kind: "restart",
        status: "ok",
        ts: Date.now(),
        sessionKey: "agent:main:whatsapp:dm:+15555550001",
      },
    });

    await wakeInterruptedSessions();

    // Only the non-sentinel session should get an event
    expect(enqueueSystemEvent).toHaveBeenCalledTimes(1);
    expect(enqueueSystemEvent).toHaveBeenCalledWith(expect.any(String), {
      sessionKey: "agent:main:telegram:dm:789",
    });
    expect(requestHeartbeatNow).toHaveBeenCalled();
  });

  it("skips cron/subagent sessions", async () => {
    const sessions: InterruptedSession[] = [
      {
        sessionKey: "cron:daily-summary",
        sessionId: "session-cron",
        runId: "run-cron",
        startedAt: Date.now(),
        pid: 12345,
      },
      {
        sessionKey: "agent:main:discord:dm:456",
        sessionId: "session-regular",
        runId: "run-regular",
        startedAt: Date.now(),
        pid: 12345,
      },
    ];
    vi.mocked(consumeInterruptedSessions).mockReturnValue(sessions);
    vi.mocked(readRestartSentinel).mockResolvedValue(null);

    await wakeInterruptedSessions();

    // Only the non-cron session should get an event
    expect(enqueueSystemEvent).toHaveBeenCalledTimes(1);
    expect(enqueueSystemEvent).toHaveBeenCalledWith(expect.any(String), {
      sessionKey: "agent:main:discord:dm:456",
    });
  });

  it("does not trigger heartbeat when all sessions are skipped", async () => {
    const sessions: InterruptedSession[] = [
      {
        sessionKey: "cron:daily-summary",
        sessionId: "session-cron",
        runId: "run-cron",
        startedAt: Date.now(),
        pid: 12345,
      },
    ];
    vi.mocked(consumeInterruptedSessions).mockReturnValue(sessions);
    vi.mocked(readRestartSentinel).mockResolvedValue(null);

    await wakeInterruptedSessions();

    expect(enqueueSystemEvent).not.toHaveBeenCalled();
    expect(requestHeartbeatNow).not.toHaveBeenCalled();
  });
});
