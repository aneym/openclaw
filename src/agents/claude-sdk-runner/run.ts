import type { RunEmbeddedPiAgentParams } from "../pi-embedded-runner/run/params.js";
import type { EmbeddedPiRunResult } from "../pi-embedded-runner/types.js";
import { createMcpServerFromTools } from "./tools.js";
import { createOpenClawCodingTools } from "../pi-tools.js";
import { resolveOpenClawAgentDir } from "../agent-paths.js";
import { DEFAULT_MODEL } from "../defaults.js";
import {
  emitAgentEvent,
  registerAgentRunContext,
  clearAgentRunContext,
} from "../../infra/agent-events.js";

/**
 * Runs an agent request through the Claude Agent SDK instead of Pi.
 *
 * Translates OpenClaw's RunEmbeddedPiAgentParams → SDK query() call,
 * iterates the async generator, fires OpenClaw callbacks, and returns
 * an EmbeddedPiRunResult with the same shape callers expect.
 */
export async function runClaudeAgentSDK(
  params: RunEmbeddedPiAgentParams,
): Promise<EmbeddedPiRunResult> {
  const { query } = await import("@anthropic-ai/claude-agent-sdk");

  const started = Date.now();
  const runId = params.runId;
  const agentDir = params.agentDir ?? resolveOpenClawAgentDir();

  // Register run context so gateway can route events to the correct session
  registerAgentRunContext(runId, {
    sessionKey: params.sessionKey,
  });

  // Emit lifecycle start — gateway forwards to web UI
  emitAgentEvent({
    runId,
    stream: "lifecycle",
    data: { phase: "start", startedAt: started },
  });
  void params.onAgentEvent?.({
    stream: "lifecycle",
    data: { phase: "start" },
  });

  // Build OpenClaw tools and wrap as MCP server
  const openclawTools = createOpenClawCodingTools({
    exec: params.execOverrides,
    messageProvider: params.messageProvider,
    agentAccountId: params.agentAccountId,
    messageTo: params.messageTo,
    messageThreadId: params.messageThreadId,
    sandbox: null,
    sessionKey: params.sessionKey,
    agentDir,
    workspaceDir: params.workspaceDir,
    config: params.config,
    abortSignal: params.abortSignal,
    modelProvider: params.provider,
    modelId: params.model,
    currentChannelId: params.currentChannelId,
    currentThreadTs: params.currentThreadTs,
    groupId: params.groupId,
    groupChannel: params.groupChannel,
    groupSpace: params.groupSpace,
    spawnedBy: params.spawnedBy,
    senderId: params.senderId,
    senderName: params.senderName,
    senderUsername: params.senderUsername,
    senderE164: params.senderE164,
    replyToMode: params.replyToMode,
    hasRepliedRef: params.hasRepliedRef,
  });

  const mcpServer = await createMcpServerFromTools(openclawTools);

  // Build system prompt from extra system prompt if provided
  const systemPrompt = params.extraSystemPrompt ? params.extraSystemPrompt : undefined;

  // Map OpenClaw model ID to SDK model string
  const model = params.model ?? DEFAULT_MODEL;

  // Resolve permission mode — SDK runs tools autonomously
  const permissionMode = params.disableTools ? "plan" : "bypassPermissions";

  // Collect response text and metadata
  const textParts: string[] = [];
  let sessionId = params.sessionId;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;

  try {
    const q = query({
      prompt: params.prompt,
      options: {
        model,
        systemPrompt,
        mcpServers: {
          "openclaw-tools": mcpServer,
        },
        permissionMode,
        allowDangerouslySkipPermissions: permissionMode === "bypassPermissions",
        cwd: params.workspaceDir,
        abortController: params.abortSignal
          ? abortSignalToController(params.abortSignal)
          : undefined,
        maxTurns: 100,
        includePartialMessages: true,
      },
    });

    for await (const message of q) {
      switch (message.type) {
        case "system": {
          if (message.subtype === "init") {
            sessionId = message.session_id;
          }
          break;
        }

        case "stream_event": {
          // Partial streaming — fire onPartialReply and emit assistant event
          const event = message.event;
          if (
            event.type === "content_block_delta" &&
            "delta" in event &&
            event.delta?.type === "text_delta" &&
            "text" in event.delta
          ) {
            const deltaText = event.delta.text as string;
            await params.onPartialReply?.({ text: deltaText });
            emitAgentEvent({
              runId,
              stream: "assistant",
              data: { text: deltaText },
            });
          }
          break;
        }

        case "assistant": {
          // Full assistant message — extract text and tool use blocks
          const content = message.message?.content;
          if (!content) break;

          for (const block of content) {
            if ("text" in block && typeof block.text === "string") {
              textParts.push(block.text);
              await params.onBlockReply?.({ text: block.text });
            }
            if ("name" in block && typeof block.name === "string") {
              // Tool use block
              params.onAgentEvent?.({
                stream: "tool_execution_start",
                data: { tool: block.name },
              });
            }
          }

          // Fire flush after block reply
          await params.onBlockReplyFlush?.();
          break;
        }

        case "result": {
          // Final result — extract usage
          if ("usage" in message) {
            const u = message.usage;
            totalInputTokens = u?.input_tokens ?? 0;
            totalOutputTokens = u?.output_tokens ?? 0;
            totalCacheRead = u?.cache_read_input_tokens ?? 0;
            totalCacheWrite = u?.cache_creation_input_tokens ?? 0;
          }
          if (message.subtype === "success" && "result" in message) {
            const resultText = message.result as string;
            if (resultText && !textParts.includes(resultText)) {
              textParts.push(resultText);
            }
          }
          break;
        }
      }
    }
  } catch (err) {
    const errorText = err instanceof Error ? err.message : String(err);

    // Emit lifecycle error so web UI clears loading
    emitAgentEvent({
      runId,
      stream: "lifecycle",
      data: { phase: "error", endedAt: Date.now(), error: errorText },
    });
    void params.onAgentEvent?.({
      stream: "lifecycle",
      data: { phase: "error" },
    });
    clearAgentRunContext(runId);

    return {
      payloads: [{ text: `Claude Agent SDK error: ${errorText}`, isError: true }],
      meta: {
        durationMs: Date.now() - started,
        agentMeta: {
          sessionId,
          provider: "anthropic",
          model,
        },
        error: { kind: "context_overflow", message: errorText },
      },
    };
  }

  // Emit lifecycle end so web UI clears loading
  emitAgentEvent({
    runId,
    stream: "lifecycle",
    data: { phase: "end", endedAt: Date.now() },
  });
  void params.onAgentEvent?.({
    stream: "lifecycle",
    data: { phase: "end" },
  });
  clearAgentRunContext(runId);

  const fullText = textParts.join("\n\n").trim();
  const payloads = fullText ? [{ text: fullText }] : undefined;

  return {
    payloads,
    meta: {
      durationMs: Date.now() - started,
      agentMeta: {
        sessionId,
        provider: "anthropic",
        model,
        usage: {
          input: totalInputTokens,
          output: totalOutputTokens,
          cacheRead: totalCacheRead,
          cacheWrite: totalCacheWrite,
          total: totalInputTokens + totalOutputTokens,
        },
      },
    },
  };
}

/** Wraps an existing AbortSignal into an AbortController the SDK expects. */
function abortSignalToController(signal: AbortSignal): AbortController {
  const controller = new AbortController();
  if (signal.aborted) {
    controller.abort(signal.reason);
  } else {
    signal.addEventListener("abort", () => controller.abort(signal.reason), {
      once: true,
    });
  }
  return controller;
}
