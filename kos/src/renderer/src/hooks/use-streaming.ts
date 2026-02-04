import { useState, useEffect, useCallback, useRef } from "react";
import { klog } from "../lib/klog";
import { useGatewayStore } from "../stores/gateway-store";

export interface ActiveTool {
  toolCallId: string;
  toolName: string;
  toolInput: unknown;
  startedAt: number;
}

export interface StreamingState {
  isStreaming: boolean;
  streamText: string;
  runId: string | null;
  /** Currently executing tools (for live display) */
  activeTools: ActiveTool[];
  /** When streaming started (for elapsed time display) */
  streamStartedAt: number | null;
  /**
   * Clear streaming state. Call this after history reload completes
   * to avoid flash when streaming text disappears before final message arrives.
   */
  clearStreaming: () => void;
}

interface ChatEventPayload {
  runId: string;
  sessionKey: string;
  state: "delta" | "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
}

interface AgentEventPayload {
  runId: string;
  sessionKey: string;
  stream: "tool" | "text" | "reasoning" | null;
  data?: {
    phase?: "start" | "end";
    toolCallId?: string;
    toolName?: string;
    toolInput?: unknown;
    result?: unknown;
    error?: string;
  };
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
 * Important: On "final", we set isStreaming=false but keep streamText visible.
 * The caller must call clearStreaming() after history reload completes to avoid
 * a flash where streaming text disappears before the final message arrives.
 *
 * @param sessionKey - The session key to track
 * @returns Streaming state (isStreaming, streamText, runId, clearStreaming)
 */
export function useStreaming(sessionKey: string): StreamingState {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [activeTools, setActiveTools] = useState<ActiveTool[]>([]);
  const [streamStartedAt, setStreamStartedAt] = useState<number | null>(null);
  const subscribe = useGatewayStore((s) => s.subscribe);

  // Use ref to track runId inside effect without causing re-subscriptions
  const runIdRef = useRef<string | null>(null);
  runIdRef.current = runId;

  // Manual clear function - call after history reload completes
  const clearStreaming = useCallback(() => {
    klog.streaming("clearStreaming called");
    setStreamText("");
    setRunId(null);
    setActiveTools([]);
    setStreamStartedAt(null);
  }, []);

  useEffect(() => {
    if (!sessionKey) {
      return;
    }

    // Subscribe to chat events for streaming text
    const unsubscribeChat = subscribe("chat", (payload: unknown) => {
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
        // Use ref to check current value without causing effect re-runs
        if (!runIdRef.current && event.runId) {
          klog.streaming("starting new run", event.runId);
          setRunId(event.runId);
          setIsStreaming(true);
          setStreamStartedAt(Date.now());
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
        // Run ended - mark as not streaming but DON'T clear streamText yet
        // The caller will clear after history reload to avoid flash
        setIsStreaming(false);
        setActiveTools([]);
      }
    });

    // Subscribe to agent events for tool execution tracking
    const unsubscribeAgent = subscribe("agent", (payload: unknown) => {
      const event = payload as AgentEventPayload;

      // Only handle events for our session
      if (event.sessionKey !== sessionKey) {
        return;
      }

      // Track tool execution start/end
      if (event.stream === "tool" && event.data) {
        const { phase, toolCallId, toolName, toolInput } = event.data;

        if (phase === "start" && toolCallId && toolName) {
          klog.streaming("tool started", { toolCallId, toolName });
          setActiveTools((prev) => [
            ...prev,
            {
              toolCallId,
              toolName,
              toolInput,
              startedAt: Date.now(),
            },
          ]);
        } else if (phase === "end" && toolCallId) {
          klog.streaming("tool ended", { toolCallId });
          setActiveTools((prev) => prev.filter((t) => t.toolCallId !== toolCallId));
        }
      }
    });

    return () => {
      unsubscribeChat();
      unsubscribeAgent();
    };
  }, [sessionKey, subscribe]);

  return { isStreaming, streamText, runId, activeTools, streamStartedAt, clearStreaming };
}
