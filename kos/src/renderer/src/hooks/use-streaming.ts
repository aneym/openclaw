import { useState, useEffect } from "react";
import { klog } from "../lib/klog";
import { useGatewayStore } from "../stores/gateway-store";

export interface StreamingState {
  isStreaming: boolean;
  streamText: string;
  runId: string | null;
}

interface ChatEventPayload {
  runId: string;
  sessionKey: string;
  state: "delta" | "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
}

/**
 * Extract text from a message object (handles string content, array content blocks, or text field).
 * Matches the web-ui's extractText pattern.
 */
function extractText(message: unknown): string | null {
  if (!message || typeof message !== "object") {
    return null;
  }

  const m = message as Record<string, unknown>;
  const content = m.content;

  // String content
  if (typeof content === "string") {
    return content;
  }

  // Array content (Anthropic format with content blocks)
  if (Array.isArray(content)) {
    const parts = content
      .map((p) => {
        const item = p as Record<string, unknown>;
        if (item.type === "text" && typeof item.text === "string") {
          return item.text;
        }
        return null;
      })
      .filter((v): v is string => typeof v === "string");

    if (parts.length > 0) {
      return parts.join("\n");
    }
  }

  // Fallback: top-level text field
  if (typeof m.text === "string") {
    return m.text;
  }

  return null;
}

/**
 * Track streaming state for a session.
 * Subscribes to chat events and extracts cumulative text from delta messages.
 *
 * Key insight: The gateway sends CUMULATIVE text in each delta event,
 * not incremental chunks. We replace (not append) the stream text,
 * using length comparison to handle out-of-order delivery.
 *
 * @param sessionKey - The session key to track
 * @returns Streaming state (isStreaming, streamText, runId)
 */
export function useStreaming(sessionKey: string): StreamingState {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const subscribe = useGatewayStore((s) => s.subscribe);

  useEffect(() => {
    if (!sessionKey) {
      return;
    }

    // Subscribe to chat events (not agent events) for streaming
    const unsubscribe = subscribe("chat", (payload: unknown) => {
      const event = payload as ChatEventPayload;

      klog.streaming("chat event received", {
        eventSessionKey: event.sessionKey,
        ourSessionKey: sessionKey,
        state: event.state,
        runId: event.runId,
        hasMessage: !!event.message,
      });

      // Only handle events for our session
      if (event.sessionKey !== sessionKey) {
        klog.streaming("ignoring event for different session");
        return;
      }

      if (event.state === "delta") {
        // Adopt runId from incoming deltas (handles reconnect case)
        if (!runId && event.runId) {
          klog.streaming("starting new run", event.runId);
          setRunId(event.runId);
          setIsStreaming(true);
        }

        // Extract cumulative text from the message
        const nextText = extractText(event.message);
        if (typeof nextText === "string") {
          klog.streaming("delta text length:", nextText.length);
          // Replace if longer (handles out-of-order delivery)
          setStreamText((current) => {
            if (!current || nextText.length >= current.length) {
              return nextText;
            }
            return current;
          });
        }
      } else if (event.state === "final" || event.state === "aborted" || event.state === "error") {
        klog.streaming(`run ended (${event.state})`);
        // Run ended - clear streaming state
        setIsStreaming(false);
        setStreamText("");
        setRunId(null);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [sessionKey, subscribe, runId]);

  return { isStreaming, streamText, runId };
}
