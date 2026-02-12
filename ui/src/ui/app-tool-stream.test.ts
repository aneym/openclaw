import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  flushToolStreamSync,
  handleAgentEvent,
  handleAgentEventForThread,
} from "./app-tool-stream";
import { createThreadDescriptor, createThreadState } from "./thread-state";

function createHost() {
  return {
    sessionKey: "main",
    chatRunId: null,
    chatStream: null,
    chatStreamReasoning: null,
    chatStreamStartedAt: null,
    toolStreamById: new Map(),
    toolStreamOrder: [],
    chatToolMessages: [],
    toolStreamSyncTimer: null,
  };
}

describe("app-tool-stream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("adopts run state from tool events before chat deltas arrive", () => {
    const host = createHost();
    handleAgentEvent(host, {
      runId: "run-1",
      seq: 1,
      stream: "tool",
      ts: 1,
      sessionKey: "main",
      data: {
        phase: "start",
        toolCallId: "tc-1",
        name: "exec",
        args: { cmd: "ls" },
      },
    });
    flushToolStreamSync(host);

    expect(host.chatRunId).toBe("run-1");
    expect(host.chatStream).toBe("");
    expect(host.chatToolMessages).toHaveLength(1);
    const msg = host.chatToolMessages[0] as {
      toolCallId?: string;
      content?: Array<{ type?: string; name?: string }>;
    };
    expect(msg.toolCallId).toBe("tc-1");
    expect(msg.content?.[0]?.type).toBe("toolcall");
    expect(msg.content?.[0]?.name).toBe("exec");
  });

  it("ignores tool events for other sessions", () => {
    const host = createHost();
    handleAgentEvent(host, {
      runId: "run-1",
      seq: 1,
      stream: "tool",
      ts: 1,
      sessionKey: "other-session",
      data: {
        phase: "start",
        toolCallId: "tc-1",
        name: "exec",
      },
    });
    flushToolStreamSync(host);

    expect(host.chatRunId).toBe(null);
    expect(host.chatToolMessages).toHaveLength(0);
  });

  it("updates live reasoning stream from thinking events", () => {
    const host = createHost();
    handleAgentEvent(host, {
      runId: "run-think",
      seq: 1,
      stream: "thinking",
      ts: 1,
      sessionKey: "main",
      data: {
        text: "Step 1: gather context",
      },
    });
    flushToolStreamSync(host);

    expect(host.chatRunId).toBe("run-think");
    expect(host.chatStream).toBe("");
    expect(host.chatStreamReasoning).toContain("Step 1");
    expect(host.chatToolMessages).toHaveLength(0);
  });

  it("matches canonical and alias session keys for host reasoning events", () => {
    const host = createHost();
    handleAgentEvent(host, {
      runId: "run-think",
      seq: 1,
      stream: "thinking",
      ts: 1,
      sessionKey: "agent:main:main",
      data: {
        text: "Plan",
      },
    });

    expect(host.chatRunId).toBe("run-think");
    expect(host.chatStreamReasoning).toBe("Plan");
  });

  it("appends reasoning when only delta is provided", () => {
    const host = createHost();
    handleAgentEvent(host, {
      runId: "run-think",
      seq: 1,
      stream: "thinking",
      ts: 1,
      sessionKey: "main",
      data: {
        delta: "Step 1",
      },
    });
    handleAgentEvent(host, {
      runId: "run-think",
      seq: 2,
      stream: "thinking",
      ts: 2,
      sessionKey: "main",
      data: {
        delta: " + Step 2",
      },
    });

    expect(host.chatStreamReasoning).toBe("Step 1 + Step 2");
  });

  it("adopts run state for non-focused thread tool events", () => {
    const descriptor = createThreadDescriptor("main", "Thread");
    const thread = createThreadState(descriptor);

    handleAgentEventForThread(thread, {
      runId: "run-thread",
      seq: 1,
      stream: "tool",
      ts: 1,
      sessionKey: descriptor.sessionKey,
      data: {
        phase: "start",
        toolCallId: "tc-thread",
        name: "read",
        args: { path: "README.md" },
      },
    });

    vi.advanceTimersByTime(120);
    expect(thread.chatRunId).toBe("run-thread");
    expect(thread.chatStream).toBe("");
    expect(thread.chatToolMessages).toHaveLength(1);
  });

  it("matches canonical and alias session keys for thread reasoning events", () => {
    const descriptor = createThreadDescriptor("main", "Thread");
    const thread = createThreadState(descriptor);

    handleAgentEventForThread(thread, {
      runId: "run-thread",
      seq: 1,
      stream: "thinking",
      ts: 1,
      sessionKey: `agent:main:${descriptor.sessionKey}`,
      data: {
        text: "Reasoning",
      },
    });

    expect(thread.chatRunId).toBe("run-thread");
    expect(thread.chatStreamReasoning).toBe("Reasoning");
  });
});
