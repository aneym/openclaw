import type { AnyAgentTool } from "../pi-tools.types.js";

/**
 * Wraps OpenClaw's `AnyAgentTool[]` as an in-process MCP server
 * that the Claude Agent SDK can consume via `createSdkMcpServer`.
 *
 * Each tool's `execute()` is preserved — the SDK calls them through MCP.
 */
export async function createMcpServerFromTools(tools: AnyAgentTool[]) {
  const { createSdkMcpServer, tool } = await import("@anthropic-ai/claude-agent-sdk");
  const { z } = await import("zod");

  const sdkTools = tools.map((t) => {
    // Convert TypeBox schema → Zod schema.
    // TypeBox parameters carry `properties` in a JSON Schema object.
    // We convert top-level properties to z.any() since the SDK validates via JSON Schema at the
    // MCP layer. This preserves the original schema description for the LLM while letting the
    // handler receive the raw parsed object.
    // biome-ignore lint/suspicious/noExplicitAny: TypeBox schema → Zod passthrough
    const props = (t.parameters?.properties ?? {}) as Record<string, unknown>;
    // eslint-disable-next-line typescript-eslint/no-explicit-any -- Zod shape for SDK tool registration
    const zodShape: Record<string, any> = {};
    for (const key of Object.keys(props)) {
      zodShape[key] = z.any();
    }

    return tool(
      t.name,
      t.description,
      zodShape,
      // eslint-disable-next-line typescript-eslint/no-explicit-any -- args come from SDK tool dispatch
      async (args: any) => {
        try {
          const result = await t.execute(`sdk-${Date.now()}`, args as Record<string, unknown>);
          // Map AgentToolResult → MCP CallToolResult
          const content = result.content.map((c) => {
            if ("text" in c && typeof c.text === "string") {
              return { type: "text" as const, text: c.text };
            }
            // Image content — return as text description for MCP
            return { type: "text" as const, text: "[image content]" };
          });
          return { content };
        } catch (err) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Tool error: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
            isError: true,
          };
        }
      },
    );
  });

  return createSdkMcpServer({
    name: "openclaw-tools",
    version: "1.0.0",
    tools: sdkTools,
  });
}
