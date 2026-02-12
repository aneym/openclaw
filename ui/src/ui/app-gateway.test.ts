import { describe, expect, it } from "vitest";
import { handleGatewayEvent } from "./app-gateway";
import { createLeaf } from "./split-tree";
import { createThreadDescriptor, createThreadState } from "./thread-state";

describe("handleGatewayEvent chat routing", () => {
  it("routes visible non-focused pane chat deltas to the matching thread state", () => {
    const mainDescriptor = createThreadDescriptor("main", "Main");
    const sideDescriptor = createThreadDescriptor("main", "Side");
    const mainThread = createThreadState(mainDescriptor);
    const sideThread = createThreadState(sideDescriptor);

    const threads = new Map([
      [mainDescriptor.id, mainThread],
      [sideDescriptor.id, sideThread],
    ]);
    const sessionKeyToThreadId = new Map([
      [mainDescriptor.sessionKey, mainDescriptor.id],
      [sideDescriptor.sessionKey, sideDescriptor.id],
    ]);

    const host = {
      settings: { notificationSound: false },
      password: "",
      client: null,
      connected: true,
      hello: null,
      lastError: null,
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
      sessionKey: mainDescriptor.sessionKey,
      chatRunId: null,
      refreshSessionsAfterChat: new Set(),
      execApprovalQueue: [],
      execApprovalError: null,
      toolApprovalQueue: [],
      toolApprovalError: null,
      threads,
      activeThreadId: mainDescriptor.id,
      sessionKeyToThreadId,
      chatMessages: [],
      runningSessions: new Set<string>(),
      subagentRuns: new Map(),
      slashCommands: [],
      splitLayout: {
        root: {
          kind: "branch",
          id: "branch-1",
          direction: "horizontal",
          ratio: 0.5,
          first: createLeaf(mainDescriptor.sessionKey, "pane-main"),
          second: createLeaf(sideDescriptor.sessionKey, "pane-side"),
        },
        focusedPaneId: "pane-main",
      },
    } as any;

    handleGatewayEvent(host, {
      type: "event",
      event: "chat",
      payload: {
        runId: "run-side",
        sessionKey: `agent:main:${sideDescriptor.sessionKey}`,
        state: "delta",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "side streaming text" }],
        },
      },
    });

    expect(host.chatStream).toBeUndefined();
    expect(sideThread.chatStream).toBe("side streaming text");
    expect(sideThread.chatRunId).toBe("run-side");
    expect(host.runningSessions.has(sideDescriptor.sessionKey)).toBe(true);
    expect(host.runningSessions.has(`agent:main:${sideDescriptor.sessionKey}`)).toBe(true);
  });

  it("routes session-less agent tool events to matching non-focused thread by runId", () => {
    const mainDescriptor = createThreadDescriptor("main", "Main");
    const sideDescriptor = createThreadDescriptor("main", "Side");
    const mainThread = createThreadState(mainDescriptor);
    const sideThread = createThreadState(sideDescriptor);
    sideThread.chatRunId = "run-side";
    sideThread.chatStream = "";
    sideThread.chatStreamStartedAt = Date.now();

    const threads = new Map([
      [mainDescriptor.id, mainThread],
      [sideDescriptor.id, sideThread],
    ]);
    const sessionKeyToThreadId = new Map([
      [mainDescriptor.sessionKey, mainDescriptor.id],
      [sideDescriptor.sessionKey, sideDescriptor.id],
    ]);

    const host = {
      settings: { notificationSound: false },
      password: "",
      client: null,
      connected: true,
      hello: null,
      lastError: null,
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
      sessionKey: mainDescriptor.sessionKey,
      chatRunId: null,
      refreshSessionsAfterChat: new Set(),
      execApprovalQueue: [],
      execApprovalError: null,
      toolApprovalQueue: [],
      toolApprovalError: null,
      threads,
      activeThreadId: mainDescriptor.id,
      sessionKeyToThreadId,
      chatMessages: [],
      runningSessions: new Set<string>(),
      subagentRuns: new Map(),
      slashCommands: [],
      splitLayout: {
        root: {
          kind: "branch",
          id: "branch-1",
          direction: "horizontal",
          ratio: 0.5,
          first: createLeaf(mainDescriptor.sessionKey, "pane-main"),
          second: createLeaf(sideDescriptor.sessionKey, "pane-side"),
        },
        focusedPaneId: "pane-main",
      },
    } as any;

    handleGatewayEvent(host, {
      type: "event",
      event: "agent",
      payload: {
        runId: "run-side",
        seq: 1,
        stream: "tool",
        ts: Date.now(),
        data: {
          phase: "start",
          toolCallId: "tc-1",
          name: "exec",
          args: { cmd: "ls" },
        },
      },
    });

    expect(sideThread.chatToolMessages).toHaveLength(1);
    expect(host.chatToolMessages).toBeUndefined();
  });

  it("routes canonical-keyed agent tool events to visible non-focused pane", () => {
    const mainDescriptor = createThreadDescriptor("main", "Main");
    const sideDescriptor = createThreadDescriptor("main", "Side");
    const mainThread = createThreadState(mainDescriptor);
    const sideThread = createThreadState(sideDescriptor);

    const threads = new Map([
      [mainDescriptor.id, mainThread],
      [sideDescriptor.id, sideThread],
    ]);
    const sessionKeyToThreadId = new Map([
      [mainDescriptor.sessionKey, mainDescriptor.id],
      [sideDescriptor.sessionKey, sideDescriptor.id],
    ]);

    const host = {
      settings: { notificationSound: false },
      password: "",
      client: null,
      connected: true,
      hello: null,
      lastError: null,
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
      sessionKey: mainDescriptor.sessionKey,
      chatRunId: null,
      refreshSessionsAfterChat: new Set(),
      execApprovalQueue: [],
      execApprovalError: null,
      toolApprovalQueue: [],
      toolApprovalError: null,
      threads,
      activeThreadId: mainDescriptor.id,
      sessionKeyToThreadId,
      chatMessages: [],
      runningSessions: new Set<string>(),
      subagentRuns: new Map(),
      slashCommands: [],
      splitLayout: {
        root: {
          kind: "branch",
          id: "branch-1",
          direction: "horizontal",
          ratio: 0.5,
          first: createLeaf(mainDescriptor.sessionKey, "pane-main"),
          second: createLeaf(sideDescriptor.sessionKey, "pane-side"),
        },
        focusedPaneId: "pane-main",
      },
    } as any;

    handleGatewayEvent(host, {
      type: "event",
      event: "agent",
      payload: {
        runId: "run-side",
        seq: 1,
        stream: "tool",
        ts: Date.now(),
        sessionKey: `agent:main:${sideDescriptor.sessionKey}`,
        data: {
          phase: "result",
          toolCallId: "tc-1",
          name: "exec",
          result: { text: "ok" },
        },
      },
    });

    expect(sideThread.chatRunId).toBe("run-side");
    expect(sideThread.chatToolMessages).toHaveLength(1);
  });
});
