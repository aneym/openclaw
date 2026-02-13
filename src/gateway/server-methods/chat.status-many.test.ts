import { describe, expect, it, vi } from "vitest";
import type { GatewayClient, GatewayRequestContext } from "./types.js";
import { installGatewayTestHooks } from "../test-helpers.server.js";
import { chatHandlers } from "./chat.js";

installGatewayTestHooks({ scope: "suite" });

type StatusContext = Pick<
  GatewayRequestContext,
  "chatAbortControllers" | "chatRunBuffers" | "registerToolEventRecipient"
>;

describe("chat.statusMany", () => {
  it("returns active runs for each requested session", () => {
    const respond = vi.fn();
    const context: StatusContext = {
      chatAbortControllers: new Map([
        [
          "run-1",
          {
            controller: new AbortController(),
            sessionId: "sess-1",
            sessionKey: "agent:main:main",
            startedAtMs: 1,
            expiresAtMs: 10,
          },
        ],
        [
          "run-2",
          {
            controller: new AbortController(),
            sessionId: "sess-2",
            sessionKey: "agent:main:thread:abc",
            startedAtMs: 2,
            expiresAtMs: 20,
          },
        ],
      ]),
      chatRunBuffers: new Map([
        ["run-1", "partial main reply"],
        ["run-2", "partial thread reply"],
      ]),
      registerToolEventRecipient: vi.fn(),
    };

    chatHandlers["chat.statusMany"]({
      params: {
        sessionKeys: ["main", "agent:main:thread:abc", "agent:main:thread:none"],
      },
      respond,
      context,
      client: {
        connId: "conn-1",
        connect: { caps: ["tool-events"] },
      } as unknown as GatewayClient,
    });

    expect(respond).toHaveBeenCalledWith(true, {
      statuses: [
        {
          sessionKey: "agent:main:main",
          activeRun: { runId: "run-1", streamText: "partial main reply" },
        },
        {
          sessionKey: "agent:main:thread:abc",
          activeRun: { runId: "run-2", streamText: "partial thread reply" },
        },
        {
          sessionKey: "agent:main:thread:none",
          activeRun: null,
        },
      ],
    });
    expect(context.registerToolEventRecipient).toHaveBeenCalledWith("run-1", "conn-1");
    expect(context.registerToolEventRecipient).toHaveBeenCalledWith("run-2", "conn-1");
  });

  it("rejects invalid params", () => {
    const respond = vi.fn();
    const context: StatusContext = {
      chatAbortControllers: new Map(),
      chatRunBuffers: new Map(),
      registerToolEventRecipient: vi.fn(),
    };

    chatHandlers["chat.statusMany"]({
      params: {
        sessionKeys: [],
      },
      respond,
      context,
    });

    expect(respond).toHaveBeenCalledTimes(1);
    const [ok, payload, error] = respond.mock.calls[0] as [boolean, unknown, { message?: string }];
    expect(ok).toBe(false);
    expect(payload).toBeUndefined();
    expect(error?.message).toContain("invalid chat.statusMany params");
    expect(context.registerToolEventRecipient).not.toHaveBeenCalled();
  });
});

describe("chat.status", () => {
  it("registers tool event recipient for active run when client supports tool-events", () => {
    const respond = vi.fn();
    const context: StatusContext = {
      chatAbortControllers: new Map([
        [
          "run-1",
          {
            controller: new AbortController(),
            sessionId: "sess-1",
            sessionKey: "agent:main:main",
            startedAtMs: 1,
            expiresAtMs: 10,
          },
        ],
      ]),
      chatRunBuffers: new Map([["run-1", "partial main reply"]]),
      registerToolEventRecipient: vi.fn(),
    };

    chatHandlers["chat.status"]({
      params: { sessionKey: "main" },
      respond,
      context,
      client: {
        connId: "conn-1",
        connect: { caps: ["tool-events"] },
      } as unknown as GatewayClient,
    });

    expect(respond).toHaveBeenCalledWith(true, {
      activeRun: { runId: "run-1", streamText: "partial main reply" },
    });
    expect(context.registerToolEventRecipient).toHaveBeenCalledWith("run-1", "conn-1");
  });
});

describe("chat.abort", () => {
  it("falls back to aborting by session when provided runId is stale", () => {
    const respond = vi.fn();
    const removeChatRun = vi.fn();
    const context = {
      chatAbortControllers: new Map([
        [
          "real-run",
          {
            controller: new AbortController(),
            sessionId: "sess-1",
            sessionKey: "agent:main:main",
            startedAtMs: 1,
            expiresAtMs: 10,
          },
        ],
      ]),
      chatRunBuffers: new Map([["real-run", "partial main reply"]]),
      chatDeltaSentAt: new Map([["real-run", 1]]),
      chatAbortedRuns: new Map(),
      removeChatRun,
      agentRunSeq: new Map(),
      broadcast: vi.fn(),
      nodeSendToSession: vi.fn(),
    };

    chatHandlers["chat.abort"]({
      params: {
        sessionKey: "main",
        runId: "stale-run",
      },
      respond,
      context: context as unknown as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledWith(true, {
      ok: true,
      aborted: true,
      runIds: ["real-run"],
    });
    expect(context.chatAbortControllers.has("real-run")).toBe(false);
    expect(context.chatAbortedRuns.has("real-run")).toBe(true);
    expect(removeChatRun).toHaveBeenCalledWith("real-run", "real-run", "agent:main:main");
  });
});
