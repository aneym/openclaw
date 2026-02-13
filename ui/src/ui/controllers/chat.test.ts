import { describe, expect, it, vi } from "vitest";
import {
  handleChatEvent,
  loadChatHistory,
  mergeChatMessages,
  type ChatEventPayload,
  type ChatState,
} from "./chat.ts";

function createState(overrides: Partial<ChatState> = {}): ChatState {
  return {
    chatAttachments: [],
    chatLoading: false,
    chatHistoryLoadId: null,
    chatMessage: "",
    chatMessages: [],
    chatRunId: null,
    chatSending: false,
    chatStream: null,
    chatStreamReasoning: null,
    chatStreamStartedAt: null,
    chatThinkingLevel: null,
    client: null,
    connected: true,
    lastError: null,
    sessionKey: "main",
    ...overrides,
  };
}

describe("handleChatEvent", () => {
  it("returns null when payload is missing", () => {
    const state = createState();
    expect(handleChatEvent(state, undefined)).toBe(null);
  });

  it("returns null when sessionKey does not match", () => {
    const state = createState({ sessionKey: "main" });
    const payload: ChatEventPayload = {
      runId: "run-1",
      sessionKey: "other",
      state: "final",
    };
    expect(handleChatEvent(state, payload)).toBe(null);
  });

  it("matches canonical and alias session keys", () => {
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-1",
      chatStream: "Reply",
      chatStreamStartedAt: 100,
    });
    const payload: ChatEventPayload = {
      runId: "run-1",
      sessionKey: "agent:main:main",
      state: "final",
    };
    expect(handleChatEvent(state, payload)).toBe("final");
    expect(state.chatRunId).toBe(null);
  });

  it("returns null for delta from another run", () => {
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-user",
      chatStream: "Hello",
    });
    const payload: ChatEventPayload = {
      runId: "run-announce",
      sessionKey: "main",
      state: "delta",
      message: { role: "assistant", content: [{ type: "text", text: "Done" }] },
    };
    expect(handleChatEvent(state, payload)).toBe(null);
    expect(state.chatRunId).toBe("run-user");
    expect(state.chatStream).toBe("Hello");
  });

  it("returns 'final' for final from another run (e.g. sub-agent announce) without clearing state", () => {
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-user",
      chatStream: "Working...",
      chatStreamStartedAt: 123,
    });
    const payload: ChatEventPayload = {
      runId: "run-announce",
      sessionKey: "main",
      state: "final",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Sub-agent findings" }],
      },
    };
    expect(handleChatEvent(state, payload)).toBe("final");
    expect(state.chatRunId).toBe("run-user");
    expect(state.chatStream).toBe("Working...");
    expect(state.chatStreamStartedAt).toBe(123);
  });

  it("processes final from own run and clears state", () => {
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-1",
      chatStream: "Reply",
      chatStreamStartedAt: 100,
    });
    const payload: ChatEventPayload = {
      runId: "run-1",
      sessionKey: "main",
      state: "final",
    };
    expect(handleChatEvent(state, payload)).toBe("final");
    expect(state.chatRunId).toBe(null);
    expect(state.chatStream).toBe(null);
    expect(state.chatStreamStartedAt).toBe(null);
  });
});

function createDeferred<T>() {
  let resolve: (value: T) => void;
  let reject: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve: resolve!, reject: reject! };
}

describe("loadChatHistory", () => {
  it("does not wipe optimistic local messages when server history is empty/stale", async () => {
    const client = {
      request: vi.fn(async () => ({ messages: [], thinkingLevel: "off" })),
    };
    const state = createState({
      client: client as unknown as ChatState["client"],
      connected: true,
      sessionKey: "main",
      chatMessages: [
        { role: "user", content: [{ type: "text", text: "Hello" }], _optimistic: true },
      ],
    });

    await loadChatHistory(state);
    expect(state.chatMessages).toEqual([
      { role: "user", content: [{ type: "text", text: "Hello" }], _optimistic: true },
    ]);
  });

  it("does not overwrite chat state when sessionKey changes mid-request", async () => {
    const deferred = createDeferred<{ messages?: unknown[]; thinkingLevel?: string | null }>();
    const client = {
      request: vi.fn(async (method: string, payload: unknown) => {
        expect(method).toBe("chat.history");
        expect(payload).toEqual({ sessionKey: "sess-a", limit: 200 });
        return await deferred.promise;
      }),
    };

    const state = createState({
      client: client as unknown as ChatState["client"],
      connected: true,
      sessionKey: "sess-a",
      chatMessages: ["a0"],
      chatThinkingLevel: "a",
    });

    const pending = loadChatHistory(state);

    // Simulate user switching panes/sessions while the request is in flight.
    state.sessionKey = "sess-b";
    state.chatMessages = ["b0"];
    state.chatThinkingLevel = "b";

    deferred.resolve({ messages: ["a1"], thinkingLevel: "a1" });
    await pending;

    expect(state.chatMessages).toEqual(["b0"]);
    expect(state.chatThinkingLevel).toBe("b");
    expect(state.chatLoading).toBe(false);
  });

  it("does not clear chatLoading for a newer in-flight history request", async () => {
    const deferredA = createDeferred<{ messages?: unknown[] }>();
    const deferredB = createDeferred<{ messages?: unknown[] }>();
    const client = {
      request: vi.fn(async (_method: string, payload: { sessionKey: string; limit: number }) => {
        if (payload.sessionKey === "sess-a") {
          return await deferredA.promise;
        }
        if (payload.sessionKey === "sess-b") {
          return await deferredB.promise;
        }
        throw new Error("unexpected sessionKey: " + payload.sessionKey);
      }),
    };

    const state = createState({
      client: client as unknown as ChatState["client"],
      connected: true,
      sessionKey: "sess-a",
      chatMessages: ["a0"],
    });

    const pendingA = loadChatHistory(state);
    expect(state.chatLoading).toBe(true);

    state.sessionKey = "sess-b";
    state.chatMessages = ["b0"];
    const pendingB = loadChatHistory(state);
    expect(state.chatLoading).toBe(true);

    deferredA.resolve({ messages: ["a1"] });
    await pendingA;

    // Still loading because sess-b request is the latest and still in-flight.
    expect(state.chatLoading).toBe(true);
    expect(state.chatMessages).toEqual(["b0"]);

    deferredB.resolve({ messages: ["b1"] });
    await pendingB;
    expect(state.chatLoading).toBe(false);
    expect(state.chatMessages).toEqual(["b1"]);
  });
});

describe("mergeChatMessages", () => {
  it("appends optimistic tail messages missing from the server history", () => {
    const merged = mergeChatMessages({
      serverMessages: [{ role: "user", content: [{ type: "text", text: "A" }] }],
      localMessages: [
        { role: "user", content: [{ type: "text", text: "A" }] },
        { role: "assistant", content: [{ type: "text", text: "B" }], _streamFinal: true },
      ],
    });
    expect(merged).toEqual([
      { role: "user", content: [{ type: "text", text: "A" }] },
      { role: "assistant", content: [{ type: "text", text: "B" }], _streamFinal: true },
    ]);
  });

  it("drops _streamFinal when server has equivalent assistant message", () => {
    const merged = mergeChatMessages({
      serverMessages: [
        { role: "user", content: [{ type: "text", text: "A" }] },
        { role: "assistant", content: [{ type: "text", text: "B" }] },
      ],
      localMessages: [
        { role: "user", content: [{ type: "text", text: "A" }], _optimistic: true },
        { role: "assistant", content: [{ type: "text", text: "B" }], _streamFinal: true },
      ],
    });
    expect(merged).toEqual([
      { role: "user", content: [{ type: "text", text: "A" }] },
      { role: "assistant", content: [{ type: "text", text: "B" }] },
    ]);
  });

  it("preserves local messages when server returns empty", () => {
    const local = [{ role: "user", content: [{ type: "text", text: "X" }], _optimistic: true }];
    const merged = mergeChatMessages({ serverMessages: [], localMessages: local });
    expect(merged).toEqual(local);
  });
});

describe("final event → loadChatHistory race", () => {
  it("preserves _streamFinal when server transcript is not yet flushed", async () => {
    const deferred = createDeferred<{ messages?: unknown[]; thinkingLevel?: string }>();
    const client = {
      request: vi.fn(async () => deferred.promise),
    };

    // Simulate state after handleChatEvent("final") ran:
    // - _streamFinal appended to chatMessages
    // - chatStream cleared
    const state = createState({
      client: client as unknown as ChatState["client"],
      connected: true,
      sessionKey: "main",
      chatMessages: [
        { role: "user", content: [{ type: "text", text: "Hello" }], _optimistic: true },
        { role: "assistant", content: [{ type: "text", text: "Hi there!" }], _streamFinal: true },
      ],
      chatStream: null,
      chatRunId: null,
    });

    const pending = loadChatHistory(state);

    // Server returns messages WITHOUT the assistant response (not flushed yet)
    deferred.resolve({
      messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
      thinkingLevel: "off",
    });

    await pending;

    // _streamFinal should be preserved
    const hasAssistant = state.chatMessages.some(
      (m: any) => m.role === "assistant" && m._streamFinal,
    );
    expect(hasAssistant).toBe(true);
    expect(state.chatMessages.length).toBe(2);
  });

  it("two concurrent loadChatHistory calls after final - second replaces first", async () => {
    const deferred1 = createDeferred<{ messages?: unknown[] }>();
    const deferred2 = createDeferred<{ messages?: unknown[] }>();
    let callCount = 0;
    const client = {
      request: vi.fn(async () => {
        callCount++;
        return callCount === 1 ? deferred1.promise : deferred2.promise;
      }),
    };

    const state = createState({
      client: client as unknown as ChatState["client"],
      connected: true,
      sessionKey: "main",
      chatMessages: [
        { role: "user", content: [{ type: "text", text: "Hello" }], _optimistic: true },
        { role: "assistant", content: [{ type: "text", text: "Hi there!" }], _streamFinal: true },
      ],
    });

    // First loadChatHistory (from final event handler)
    const pending1 = loadChatHistory(state);
    // Second loadChatHistory (from queryChatStatus seq gap recovery)
    const pending2 = loadChatHistory(state);

    // First returns - but should be discarded (stale chatHistoryLoadId)
    deferred1.resolve({
      messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
    });
    await pending1;

    // chatMessages should still have _streamFinal (first load was discarded)
    const hasAssistantAfterFirst = state.chatMessages.some((m: any) => m.role === "assistant");
    expect(hasAssistantAfterFirst).toBe(true);

    // Second returns WITH the full conversation
    deferred2.resolve({
      messages: [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
        { role: "assistant", content: [{ type: "text", text: "Hi there!" }] },
      ],
    });
    await pending2;

    // Should have the server's assistant message
    const assistantMsgs = state.chatMessages.filter((m: any) => m.role === "assistant");
    expect(assistantMsgs.length).toBe(1);
    // Should NOT be the _streamFinal (it was replaced by server version)
    expect((assistantMsgs[0] as any)._streamFinal).toBeFalsy();
  });
});
