import { useMemo, memo } from "react";
import type { ChatMessage, MessagePart, ToolCallPart, ToolResultPart } from "@/types/message";
import { slideUp } from "@/lib/animation-variants";
import { motion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { ImageAttachment } from "./ImageAttachment";
import { ReasoningBlock } from "./ReasoningBlock";
import { StreamingIndicator } from "./StreamingIndicator";
import { TextPart } from "./TextPart";
import { ToolCallGroup } from "./ToolCallGroup";

interface MessageGroupProps {
  messages: ChatMessage[];
  role: "user" | "assistant" | "system" | "tool";
  isStreaming?: boolean;
  streamText?: string;
  showTimestamp?: boolean;
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isYesterday) {
    return `Yesterday ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function GroupFooter({
  role,
  timestamp,
}: {
  role: "user" | "assistant" | "system" | "tool";
  timestamp: number;
}) {
  const timeStr = formatTimestamp(timestamp);

  return (
    <div
      className={cn(
        "text-xs text-muted-foreground mt-1 px-1 opacity-0 group-hover:opacity-100 transition-opacity",
        role === "user" && "text-right",
      )}
    >
      {timeStr}
    </div>
  );
}

/**
 * Extract parts by type from all messages in the group.
 * Returns: { toolParts, reasoningParts, textParts, imageParts }
 */
function extractPartsByType(messages: ChatMessage[]) {
  const toolParts: (ToolCallPart | ToolResultPart)[] = [];
  const reasoningParts: Array<{ reasoning: string; durationMs?: number }> = [];
  const textParts: Array<{ text: string; isLast: boolean }> = [];
  const imageParts: Array<{ url: string; alt?: string }> = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const isLastMessage = i === messages.length - 1;

    for (const part of msg.parts) {
      if (part.type === "tool-call" || part.type === "tool-result") {
        toolParts.push(part);
      } else if (part.type === "reasoning") {
        reasoningParts.push({ reasoning: part.reasoning, durationMs: part.durationMs });
      } else if (part.type === "text") {
        textParts.push({ text: part.text, isLast: isLastMessage });
      } else if (part.type === "image") {
        imageParts.push({ url: part.url, alt: part.alt });
      }
    }
  }

  return { toolParts, reasoningParts, textParts, imageParts };
}

/**
 * MessageGroup renders a turn (consecutive messages from the same role).
 *
 * Layout order (matching web UI):
 * 1. Tool calls (collapsed at top) - "[Wrench] N tool calls"
 * 2. Reasoning blocks (collapsed) - "[Brain] Thought..."
 * 3. Text content - actual chat message
 * 4. Images
 */
export const MessageGroup = memo(function MessageGroup({
  messages,
  role,
  isStreaming,
  streamText,
  showTimestamp = true,
}: MessageGroupProps) {
  const { toolParts, reasoningParts, textParts, imageParts } = useMemo(
    () => extractPartsByType(messages),
    [messages],
  );

  // Build tool-only messages for ToolCallGroup (it expects ChatMessage[])
  const toolMessages = useMemo(() => {
    if (toolParts.length === 0) return [];
    // Create a synthetic message containing all tool parts
    const syntheticMessage: ChatMessage = {
      id: `tools-${messages[0]?.id ?? "unknown"}`,
      role: "tool",
      parts: toolParts as MessagePart[],
      createdAt: messages[0]?.createdAt ?? Date.now(),
      chatId: messages[0]?.chatId ?? "",
    };
    return [syntheticMessage];
  }, [toolParts, messages]);

  if (messages.length === 0) return null;

  const hasTextContent = textParts.length > 0 || (isStreaming && streamText);

  return (
    <motion.div
      variants={slideUp}
      initial="initial"
      animate="animate"
      className={cn("flex flex-col group", role === "user" ? "items-end" : "items-start")}
    >
      {/* 1. Tool calls and reasoning grouped tightly */}
      {(toolMessages.length > 0 || reasoningParts.length > 0) && (
        <div className="flex flex-col">
          {toolMessages.length > 0 && <ToolCallGroup messages={toolMessages} />}
          {reasoningParts.map((rp, idx) => (
            <ReasoningBlock
              key={`reasoning-${idx}`}
              reasoning={rp.reasoning}
              durationMs={rp.durationMs}
            />
          ))}
        </div>
      )}

      {/* 2. Text content */}
      {hasTextContent && (
        <div
          className={cn(
            "max-w-[85%]",
            (toolMessages.length > 0 || reasoningParts.length > 0) && "mt-1",
            role === "user"
              ? "rounded-lg px-3 py-2 bg-muted text-foreground self-end"
              : "text-foreground self-start",
          )}
        >
          {textParts.map((tp, idx) => (
            <TextPart key={`text-${idx}`} text={tp.text} isStreaming={isStreaming && tp.isLast} />
          ))}
          {/* Streaming text */}
          {isStreaming && streamText && <span className="whitespace-pre-wrap">{streamText}</span>}
          {/* Streaming indicator when no content yet */}
          {isStreaming && !streamText && textParts.length === 0 && (
            <StreamingIndicator className="opacity-60" />
          )}
        </div>
      )}

      {/* 3. Images */}
      {imageParts.map((img, idx) => (
        <ImageAttachment key={`img-${idx}`} part={{ type: "image", ...img }} />
      ))}

      {/* 4. Timestamp pinned at bottom of entire turn */}
      {showTimestamp && <GroupFooter role={role} timestamp={messages[0].createdAt} />}
    </motion.div>
  );
});
