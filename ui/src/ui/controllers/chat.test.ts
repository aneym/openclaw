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
});
