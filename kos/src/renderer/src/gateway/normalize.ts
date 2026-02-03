/**
 * Message normalization layer — convert raw gateway messages to ChatMessage parts model.
 * Handles OpenAI format, Anthropic format, and OpenClaw internal format.
 */

import type { ChatMessage, MessagePart } from "../types/message";

/**
 * Normalize a raw gateway message into our ChatMessage parts model.
 */
export function normalizeMessage(raw: unknown, threadId: string): ChatMessage {
  const m = raw as Record<string, unknown>;

  const parts: MessagePart[] = [];

  // Extract text content (strips thinking tags from assistant messages)
  // Skip text extraction for tool result messages - the content is in the tool-result part
  if (!isToolResultMessage(m)) {
    const text = extractText(m);
    if (text?.trim()) {
      parts.push({ type: "text", text });
    }
  }

  // Extract thinking/reasoning (from <think> tags or explicit 'thinking' content blocks)
  const thinking = extractThinking(m);
  if (thinking?.trim()) {
    parts.push({ type: "reasoning", reasoning: thinking });
  }

  // Extract tool calls (from tool_calls array or content blocks)
  const toolCalls = extractToolCalls(m);
  for (const tc of toolCalls) {
    parts.push({
      type: "tool-call",
      toolCallId: tc.id,
      toolName: tc.name,
      args: tc.args,
      state: "complete",
    });
  }

  // Extract tool results (for 'tool' role messages or toolResult content blocks)
  if (isToolResultMessage(m)) {
    const toolResult = extractToolResult(m);
    if (toolResult) {
      parts.push(toolResult);
    }
  }

  // Extract images (from content blocks with type='image')
  const images = extractImages(m);
  for (const img of images) {
    parts.push({ type: "image", url: img.url, alt: img.alt });
  }

  // Extract audio (from content blocks with type='audio')
  const audio = extractAudio(m);
  for (const aud of audio) {
    parts.push({ type: "audio", url: aud.url, filename: aud.filename });
  }

  return {
    id: (m.id as string) ?? generateId(),
    role: normalizeRole(m.role as string),
    parts,
    createdAt: (m.timestamp as number) ?? Date.now(),
    threadId,
    metadata: m.metadata as Record<string, unknown> | undefined,
  };
}

/**
 * Generate a random message ID.
 */
function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Normalize role string to our canonical role types.
 */
function normalizeRole(role: unknown): ChatMessage["role"] {
  if (typeof role !== "string") return "assistant";

  const lower = role.toLowerCase();
  if (lower === "user") return "user";
  if (lower === "assistant") return "assistant";
  if (lower === "system") return "system";
  if (
    lower === "tool" ||
    lower === "toolresult" ||
    lower === "tool_result" ||
    lower === "function"
  ) {
    return "tool";
  }

  // Default unknown roles to assistant
  return "assistant";
}

/**
 * Check if a message is a tool result message.
 */
function isToolResultMessage(m: Record<string, unknown>): boolean {
  const role = typeof m.role === "string" ? m.role.toLowerCase() : "";
  if (role === "tool" || role === "toolresult" || role === "tool_result") {
    return true;
  }

  // Also check if content array has tool_result blocks
  if (Array.isArray(m.content)) {
    return m.content.some((item) => {
      const block = item as Record<string, unknown>;
      const type = typeof block.type === "string" ? block.type.toLowerCase() : "";
      return type === "tool_result" || type === "toolresult";
    });
  }

  return false;
}

/**
 * Extract text content from a message, stripping envelope headers and thinking tags.
 */
function extractText(m: Record<string, unknown>): string | null {
  const role = typeof m.role === "string" ? m.role : "";
  const content = m.content;

  // String content
  if (typeof content === "string") {
    const processed = role === "assistant" ? stripThinkingTags(content) : stripEnvelope(content);
    return processed;
  }

  // Array content (Anthropic format or OpenAI with content blocks)
  if (Array.isArray(content)) {
    const textParts = content
      .map((item) => {
        const block = item as Record<string, unknown>;
        if (block.type === "text" && typeof block.text === "string") {
          return block.text;
        }
        return null;
      })
      .filter((v): v is string => typeof v === "string");

    if (textParts.length > 0) {
      const joined = textParts.join("\n");
      const processed = role === "assistant" ? stripThinkingTags(joined) : stripEnvelope(joined);
      return processed;
    }
  }

  // Fallback: check for a top-level 'text' field
  if (typeof m.text === "string") {
    const processed = role === "assistant" ? stripThinkingTags(m.text) : stripEnvelope(m.text);
    return processed;
  }

  return null;
}

/**
 * Extract thinking/reasoning content from a message.
 * Looks for explicit 'thinking' content blocks or <think> tags in text.
 */
function extractThinking(m: Record<string, unknown>): string | null {
  const content = m.content;
  const parts: string[] = [];

  // Check for explicit 'thinking' content blocks (Anthropic extended format)
  if (Array.isArray(content)) {
    for (const item of content) {
      const block = item as Record<string, unknown>;
      if (block.type === "thinking" && typeof block.thinking === "string") {
        const cleaned = block.thinking.trim();
        if (cleaned) {
          parts.push(cleaned);
        }
      }
    }
  }

  if (parts.length > 0) {
    return parts.join("\n");
  }

  // Back-compat: extract <think> or <thinking> tags from raw text
  const rawText = extractRawText(m);
  if (!rawText) return null;

  const matches = Array.from(
    rawText.matchAll(/<\s*think(?:ing)?\s*>([\s\S]*?)<\s*\/\s*think(?:ing)?\s*>/gi),
  );
  const extracted = matches.map((match) => (match[1] ?? "").trim()).filter(Boolean);

  return extracted.length > 0 ? extracted.join("\n") : null;
}

/**
 * Extract raw text content without stripping thinking tags or envelopes.
 */
function extractRawText(m: Record<string, unknown>): string | null {
  const content = m.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    const textParts = content
      .map((item) => {
        const block = item as Record<string, unknown>;
        if (block.type === "text" && typeof block.text === "string") {
          return block.text;
        }
        return null;
      })
      .filter((v): v is string => typeof v === "string");

    return textParts.length > 0 ? textParts.join("\n") : null;
  }

  if (typeof m.text === "string") {
    return m.text;
  }

  return null;
}

/**
 * Strip <think> or <thinking> tags from text.
 * This is a simplified version — preserves everything outside the tags.
 */
function stripThinkingTags(text: string): string {
  // Remove <think> or <thinking> blocks
  return text.replace(/<\s*think(?:ing)?\s*>[\s\S]*?<\s*\/\s*think(?:ing)?\s*>/gi, "").trim();
}

/**
 * Strip envelope headers like "[WebChat] ", "[Telegram 2024-01-15 14:32] ", etc.
 */
function stripEnvelope(text: string): string {
  const ENVELOPE_PREFIX = /^\[([^\]]+)\]\s*/;
  const ENVELOPE_CHANNELS = [
    "WebChat",
    "WhatsApp",
    "Telegram",
    "Signal",
    "Slack",
    "Discord",
    "iMessage",
    "Teams",
    "Matrix",
    "Zalo",
    "Zalo Personal",
    "BlueBubbles",
  ];

  const match = text.match(ENVELOPE_PREFIX);
  if (!match) return text;

  const header = match[1] ?? "";

  // Check if header looks like an envelope (contains timestamp or known channel name)
  const looksLikeEnvelope =
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z\b/.test(header) ||
    /\d{4}-\d{2}-\d{2} \d{2}:\d{2}\b/.test(header) ||
    ENVELOPE_CHANNELS.some((label) => header.startsWith(`${label} `));

  if (!looksLikeEnvelope) return text;

  return text.slice(match[0].length);
}

/**
 * Extract tool calls from a message.
 * Handles OpenAI format (tool_calls array) and Anthropic format (content blocks with type='tool_use').
 */
function extractToolCalls(
  m: Record<string, unknown>,
): Array<{ id: string; name: string; args: Record<string, unknown> }> {
  const calls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];

  // OpenAI format: tool_calls array
  if (Array.isArray(m.tool_calls)) {
    for (const tc of m.tool_calls) {
      const call = tc as Record<string, unknown>;
      const fn = call.function as Record<string, unknown> | undefined;

      calls.push({
        id: (call.id as string) ?? generateId(),
        name: (fn?.name as string) ?? "unknown",
        args: parseArgs(fn?.arguments),
      });
    }
  }

  // Anthropic format: content blocks with type='tool_use'
  if (Array.isArray(m.content)) {
    for (const item of m.content) {
      const block = item as Record<string, unknown>;
      if (block.type === "tool_use") {
        calls.push({
          id: (block.id as string) ?? generateId(),
          name: (block.name as string) ?? "unknown",
          args: (block.input as Record<string, unknown>) ?? {},
        });
      }
    }
  }

  return calls;
}

/**
 * Parse tool call arguments (may be JSON string or object).
 */
function parseArgs(args: unknown): Record<string, unknown> {
  if (typeof args === "string") {
    try {
      return JSON.parse(args) as Record<string, unknown>;
    } catch {
      return { raw: args };
    }
  }
  if (args && typeof args === "object" && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  return {};
}

/**
 * Extract tool result from a tool message.
 */
function extractToolResult(m: Record<string, unknown>): MessagePart | null {
  // OpenAI format: top-level tool_call_id + content
  if (typeof m.tool_call_id === "string" || typeof m.toolCallId === "string") {
    const toolCallId = (m.tool_call_id ?? m.toolCallId) as string;
    const toolName = (m.tool_name ?? m.toolName ?? m.name ?? "unknown") as string;
    const content = m.content;

    return {
      type: "tool-result",
      toolCallId,
      toolName,
      result: typeof content === "string" ? content : content,
      isError: Boolean(m.is_error),
    };
  }

  // Anthropic format: content blocks with type='tool_result'
  if (Array.isArray(m.content)) {
    for (const item of m.content) {
      const block = item as Record<string, unknown>;
      if (block.type === "tool_result") {
        return {
          type: "tool-result",
          toolCallId: (block.tool_use_id as string) ?? generateId(),
          toolName: "unknown", // Anthropic doesn't include tool name in tool_result blocks
          result: block.content,
          isError: Boolean(block.is_error),
        };
      }
    }
  }

  return null;
}

/**
 * Extract images from content blocks.
 */
function extractImages(m: Record<string, unknown>): Array<{ url: string; alt?: string }> {
  const images: Array<{ url: string; alt?: string }> = [];

  if (Array.isArray(m.content)) {
    for (const item of m.content) {
      const block = item as Record<string, unknown>;
      if (block.type === "image") {
        // Anthropic format: image.source.data (base64) or image.source.url
        const source = block.source as Record<string, unknown> | undefined;
        if (source) {
          if (typeof source.url === "string") {
            images.push({ url: source.url, alt: block.alt as string | undefined });
          } else if (typeof source.data === "string" && typeof source.media_type === "string") {
            // Convert base64 to data URL
            const dataUrl = `data:${source.media_type};base64,${source.data}`;
            images.push({ url: dataUrl, alt: block.alt as string | undefined });
          }
        }
      } else if (block.type === "image_url") {
        // OpenAI format: image_url.url
        const imageUrl = block.image_url as Record<string, unknown> | undefined;
        if (imageUrl && typeof imageUrl.url === "string") {
          images.push({ url: imageUrl.url });
        }
      }
    }
  }

  return images;
}

/**
 * Extract audio attachments from content blocks.
 */
function extractAudio(m: Record<string, unknown>): Array<{ url: string; filename?: string }> {
  const audio: Array<{ url: string; filename?: string }> = [];

  if (Array.isArray(m.content)) {
    for (const item of m.content) {
      const block = item as Record<string, unknown>;
      if (block.type === "audio") {
        if (typeof block.url === "string") {
          audio.push({ url: block.url, filename: block.filename as string | undefined });
        } else if (typeof block.data === "string" && typeof block.media_type === "string") {
          // Convert base64 to data URL
          const dataUrl = `data:${block.media_type};base64,${block.data}`;
          audio.push({ url: dataUrl, filename: block.filename as string | undefined });
        }
      }
    }
  }

  return audio;
}
