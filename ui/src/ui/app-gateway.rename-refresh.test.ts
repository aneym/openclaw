import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHAT_SESSIONS_ACTIVE_MINUTES } from "./app-chat";

const { loadSessionsMock } = vi.hoisted(() => ({
  loadSessionsMock: vi.fn(),
}));

vi.mock("./controllers/sessions", () => ({
  loadSessions: loadSessionsMock,
}));

import { handleGatewayEvent } from "./app-gateway";

function createHost() {
  return {
    settings: {
      notificationSound: false,
      sessionKey: "main",
      lastActiveSessionKey: "main",
    },
    password: "",
    client: null,
    connected: true,
    hello: null,
    lastError: null,
    onboarding: false,
    eventLogBuffer: [],
    eventLog: [],
    tab: "chat",
    presenceEntries: [],
    presenceError: null,
    presenceStatus: null,
    agentsLoading: false,
    agentsList: null,
    agentsError: null,
    debugHealth: null,
    assistantName: "OpenClaw",
    assistantAvatar: null,
    assistantAgentId: null,
    sessionKey: "main",
    chatRunId: null,
    refreshSessionsAfterChat: new Set<string>(),
    execApprovalQueue: [],
    execApprovalError: null,
    toolApprovalQueue: [],
    toolApprovalError: null,
    threads: new Map(),
    activeThreadId: null,
    sessionKeyToThreadId: new Map(),
    chatMessages: [],
    chatToolMessages: [],
    toolStreamById: new Map(),
    toolStreamOrder: [],
    toolStreamSyncTimer: null,
    chatStream: null,
    chatStreamReasoning: null,
    chatStreamStartedAt: null,
    chatLoading: false,
    chatSending: false,
    chatMessage: "",
    chatAttachments: [],
    chatQueue: [],
    runningSessions: new Set<string>(),
    subagentRuns: new Map(),
    slashCommands: [],
  } as any;
}

describe("handleGatewayEvent session rename refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    loadSessionsMock.mockReset();
    const globalObj = globalThis as {
      window?: typeof globalThis;
      document?: { hasFocus: () => boolean };
    };
    globalObj.window = globalThis;
    globalObj.document = {
      hasFocus: () => true,
    };
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("refreshes sessions immediately and retries after final chat events", () => {
    const host = createHost();
    host.refreshSessionsAfterChat.add("run-1");

    handleGatewayEvent(host, {
      type: "event",
      event: "chat",
      payload: {
        runId: "run-1",
        sessionKey: "main",
        state: "final",
      },
    });

    expect(loadSessionsMock).toHaveBeenCalledTimes(1);
    expect(loadSessionsMock).toHaveBeenLastCalledWith(host, {
      activeMinutes: CHAT_SESSIONS_ACTIVE_MINUTES,
    });
    expect(host.refreshSessionsAfterChat.has("run-1")).toBe(false);

    vi.advanceTimersByTime(2_999);
    expect(loadSessionsMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(loadSessionsMock).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(7_000);
    expect(loadSessionsMock).toHaveBeenCalledTimes(3);
  });

  it("coalesces rapid finals into one retry schedule", () => {
    const host = createHost();

    handleGatewayEvent(host, {
      type: "event",
      event: "chat",
      payload: {
        runId: "run-1",
        sessionKey: "main",
        state: "final",
      },
    });
    expect(loadSessionsMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(200);
    handleGatewayEvent(host, {
      type: "event",
      event: "chat",
      payload: {
        runId: "run-2",
        sessionKey: "main",
        state: "final",
      },
    });

    // Throttle suppresses the second immediate refresh.
    expect(loadSessionsMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2_999);
    expect(loadSessionsMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(loadSessionsMock).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(7_000);
    expect(loadSessionsMock).toHaveBeenCalledTimes(3);
  });
});
