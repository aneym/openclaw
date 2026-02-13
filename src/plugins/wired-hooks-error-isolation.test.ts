import { describe, expect, it, vi } from "vitest";
import type { PluginRegistry } from "./registry.js";
import { createHookRunner } from "./hooks.js";

function createMockRegistry(
  hooks: Array<{
    pluginId?: string;
    hookName: string;
    handler: (...args: unknown[]) => unknown;
    priority?: number;
  }>,
): PluginRegistry {
  return {
    hooks: hooks as never[],
    typedHooks: hooks.map((h, index) => ({
      pluginId: h.pluginId ?? `test-plugin-${index}`,
      hookName: h.hookName,
      handler: h.handler,
      priority: h.priority ?? 0,
      source: "test",
    })),
    tools: [],
    httpHandlers: [],
    httpRoutes: [],
    channelRegistrations: [],
    gatewayHandlers: {},
    cliRegistrars: [],
    services: [],
    providers: [],
    commands: [],
  } as unknown as PluginRegistry;
}

describe("hook runner error isolation", () => {
  it("keeps before_agent_start non-blocking when one hook fails", async () => {
    const failing = vi.fn().mockRejectedValue(new Error("boom"));
    const succeeding = vi.fn().mockResolvedValue({ prependContext: "recalled context" });
    const logger = {
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const runner = createHookRunner(
      createMockRegistry([
        { pluginId: "hindsight-broken", hookName: "before_agent_start", handler: failing },
        { pluginId: "hindsight-ok", hookName: "before_agent_start", handler: succeeding },
      ]),
      { logger },
    );

    const result = await runner.runBeforeAgentStart(
      { prompt: "wrapped prompt", rawMessage: "clean prompt" },
      { channelId: "webchat" },
    );

    expect(succeeding).toHaveBeenCalledTimes(1);
    expect(result?.prependContext).toBe("recalled context");
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("before_agent_start handler from hindsight-broken failed"),
    );
  });

  it("keeps message_sending non-blocking when one hook fails", async () => {
    const failing = vi.fn().mockRejectedValue(new Error("network error"));
    const succeeding = vi.fn().mockResolvedValue({ content: "rewritten output" });
    const logger = {
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const runner = createHookRunner(
      createMockRegistry([
        { pluginId: "hook-a", hookName: "message_sending", handler: failing },
        { pluginId: "hook-b", hookName: "message_sending", handler: succeeding },
      ]),
      { logger },
    );

    const result = await runner.runMessageSending(
      { to: "user-123", content: "original output" },
      { channelId: "telegram" },
    );

    expect(result?.content).toBe("rewritten output");
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("message_sending handler from hook-a failed"),
    );
  });

  it("keeps message_received non-blocking when one hook fails", async () => {
    const failing = vi.fn().mockRejectedValue(new Error("downstream timeout"));
    const succeeding = vi.fn().mockResolvedValue(undefined);
    const logger = {
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const runner = createHookRunner(
      createMockRegistry([
        { pluginId: "hook-a", hookName: "message_received", handler: failing },
        { pluginId: "hook-b", hookName: "message_received", handler: succeeding },
      ]),
      { logger },
    );

    await expect(
      runner.runMessageReceived(
        { from: "sender-1", content: "incoming message" },
        { channelId: "slack" },
      ),
    ).resolves.toBeUndefined();
    expect(succeeding).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("message_received handler from hook-a failed"),
    );
  });
});
