import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import { installGatewayTestHooks, testState, writeSessionStore } from "../test-helpers.js";
import { chatHandlers } from "./chat.js";

installGatewayTestHooks({ scope: "suite" });

describe("chat.history (pending webchat prompts)", () => {
  it("includes the outbound user message during an in-flight run when transcript is empty", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-chat-history-"));
    try {
      testState.sessionStorePath = path.join(dir, "sessions.json");

      await writeSessionStore({
        entries: {
          main: {
            sessionId: "sess-1",
            updatedAt: Date.now(),
            thinkingLevel: "off",
          },
        },
      });

      const respond = vi.fn();
      const context = {
        chatAbortControllers: new Map([
          [
            "run-1",
            {
              controller: new AbortController(),
              sessionId: "sess-1",
              sessionKey: "agent:main:main",
              startedAtMs: 1,
              expiresAtMs: 1000,
              pendingUserMessage: {
                role: "user",
                content: [{ type: "text", text: "hello" }],
                timestamp: Date.now(),
              },
            },
          ],
        ]),
        loadGatewayModelCatalog: async () => [],
      } as unknown as GatewayRequestContext;

      await chatHandlers["chat.history"]({
        params: { sessionKey: "main", limit: 200 },
        respond,
        context,
      });

      expect(respond).toHaveBeenCalledTimes(1);
      const [ok, payload] = respond.mock.calls[0] as [
        boolean,
        { messages?: unknown[] } | undefined,
      ];
      expect(ok).toBe(true);
      expect(payload?.messages?.length).toBe(1);
      expect(payload?.messages?.[0]).toMatchObject({
        role: "user",
        content: [{ type: "text", text: "hello" }],
      });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
