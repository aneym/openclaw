import type { AgentTool } from "@mariozechner/pi-agent-core";
import { describe, expect, it, vi } from "vitest";
import { toToolDefinitions } from "./pi-tool-definition-adapter.js";

describe("pi tool definition adapter", () => {
  it("wraps tool errors into a tool result", async () => {
    const tool = {
      name: "boom",
      label: "Boom",
      description: "throws",
      parameters: {},
      execute: async () => {
        throw new Error("nope");
      },
    } satisfies AgentTool<unknown, unknown>;

    const defs = toToolDefinitions([tool]);
    const result = await defs[0].execute("call1", {}, undefined, undefined);

    expect(result.details).toMatchObject({
      status: "error",
      tool: "boom",
    });
    expect(result.details).toMatchObject({ error: "nope" });
    expect(JSON.stringify(result.details)).not.toContain("\n    at ");
  });

  it("normalizes exec tool aliases in error results", async () => {
    const tool = {
      name: "bash",
      label: "Bash",
      description: "throws",
      parameters: {},
      execute: async () => {
        throw new Error("nope");
      },
    } satisfies AgentTool<unknown, unknown>;

    const defs = toToolDefinitions([tool]);
    const result = await defs[0].execute("call2", {}, undefined, undefined);

    expect(result.details).toMatchObject({
      status: "error",
      tool: "exec",
      error: "nope",
    });
  });

  it("extracts signal from 0.51.0 convention (toolCallId, params, signal, onUpdate, ctx)", async () => {
    const signal = new AbortController().signal;
    const onUpdate = vi.fn();
    const ctx = { aborted: false, extensionId: "test" }; // context object with aborted prop
    const execute = vi.fn(async () => ({ type: "text" as const, text: "ok", details: {} }));
    const tool = {
      name: "read",
      label: "Read",
      description: "reads",
      parameters: {},
      execute,
    } satisfies AgentTool<unknown, unknown>;

    const defs = toToolDefinitions([tool]);
    // 0.51.0: (toolCallId, params, signal, onUpdate, ctx)
    await (defs[0].execute as Function)("call3", { path: "/tmp" }, signal, onUpdate, ctx);

    expect(execute).toHaveBeenCalledWith("call3", { path: "/tmp" }, signal, onUpdate);
  });

  it("does not misidentify context object as AbortSignal when signal is undefined", async () => {
    const ctx = { aborted: false, extensionId: "test" }; // plain object, NOT an AbortSignal
    const execute = vi.fn(async () => ({ type: "text" as const, text: "ok", details: {} }));
    const tool = {
      name: "read",
      label: "Read",
      description: "reads",
      parameters: {},
      execute,
    } satisfies AgentTool<unknown, unknown>;

    const defs = toToolDefinitions([tool]);
    // 0.51.0: (toolCallId, params, undefined, undefined, ctx) — the crash scenario
    await (defs[0].execute as Function)("call4", { path: "/tmp" }, undefined, undefined, ctx);

    // signal must be undefined, NOT the ctx object
    expect(execute).toHaveBeenCalledWith("call4", { path: "/tmp" }, undefined, undefined);
  });

  it("extracts signal from 0.50.x convention (toolCallId, params, onUpdate, ctx, signal)", async () => {
    const signal = new AbortController().signal;
    const onUpdate = vi.fn();
    const ctx = { extensionId: "test" };
    const execute = vi.fn(async () => ({ type: "text" as const, text: "ok", details: {} }));
    const tool = {
      name: "read",
      label: "Read",
      description: "reads",
      parameters: {},
      execute,
    } satisfies AgentTool<unknown, unknown>;

    const defs = toToolDefinitions([tool]);
    // 0.50.x: (toolCallId, params, onUpdate, ctx, signal)
    await (defs[0].execute as Function)("call5", { path: "/tmp" }, onUpdate, ctx, signal);

    expect(execute).toHaveBeenCalledWith("call5", { path: "/tmp" }, signal, onUpdate);
  });
});
