/**
 * Type declarations for the optional @anthropic-ai/claude-agent-sdk dependency.
 * The SDK is only loaded at runtime when agents.runtime is set to 'claude-agent-sdk'.
 */
declare module "@anthropic-ai/claude-agent-sdk" {
  import type { z, ZodRawShape, ZodObject } from "zod";

  interface CallToolResult {
    content: Array<{ type: string; text?: string }>;
    isError?: boolean;
  }

  interface SdkMcpToolDefinition<Schema extends ZodRawShape> {
    name: string;
    description: string;
    inputSchema: Schema;
    handler: (args: z.infer<ZodObject<Schema>>, extra: unknown) => Promise<CallToolResult>;
  }

  interface McpSdkServerConfigWithInstance {
    type: "sdk";
    name: string;
    instance: unknown;
  }

  // biome-ignore lint/suspicious/noExplicitAny: SDK generic tool definition
  export function tool<Schema extends ZodRawShape>(
    name: string,
    description: string,
    inputSchema: Schema,
    handler: (args: z.infer<ZodObject<Schema>>, extra: unknown) => Promise<CallToolResult>,
  ): SdkMcpToolDefinition<Schema>;

  // biome-ignore lint/suspicious/noExplicitAny: SDK generic tool definition
  export function createSdkMcpServer(options: {
    name: string;
    version?: string;
    tools?: Array<SdkMcpToolDefinition<any>>;
  }): McpSdkServerConfigWithInstance;

  interface SDKSystemMessage {
    type: "system";
    subtype: string;
    session_id: string;
  }

  interface SDKPartialAssistantMessage {
    type: "stream_event";
    // biome-ignore lint/suspicious/noExplicitAny: raw SDK event type
    event: any;
    parent_tool_use_id: string | null;
  }

  interface SDKAssistantMessage {
    type: "assistant";
    message?: {
      // biome-ignore lint/suspicious/noExplicitAny: content block union
      content: any[];
    };
  }

  interface SDKResultMessage {
    type: "result";
    subtype: string;
    result?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  }

  type SDKMessage =
    | SDKSystemMessage
    | SDKPartialAssistantMessage
    | SDKAssistantMessage
    | SDKResultMessage;

  interface QueryOptions {
    model?: string;
    systemPrompt?: string;
    // biome-ignore lint/suspicious/noExplicitAny: MCP server config union
    mcpServers?: Record<string, any>;
    permissionMode?: string;
    allowDangerouslySkipPermissions?: boolean;
    cwd?: string;
    abortController?: AbortController;
    maxTurns?: number;
    includePartialMessages?: boolean;
  }

  export function query(params: {
    prompt: string;
    options?: QueryOptions;
  }): AsyncGenerator<SDKMessage, void>;
}
