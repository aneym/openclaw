import { useState, useEffect } from "react";
import { useGatewayStore } from "../stores/gateway-store";

export interface StreamingState {
  isStreaming: boolean;
  streamText: string;
  runId: string | null;
}

interface AgentEventPayload {
  runId: string;
  sessionKey?: string;
  stream: "lifecycle" | "tool" | "assistant" | "error" | string;
  ts: number;
  data: Record<string, unknown>;
}

/**
 * Track streaming state for a session.
 * Subscribes to agent gateway events and tracks streaming state.
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

    // Subscribe to agent events for this session
    const unsubscribe = subscribe("agent", (payload: unknown) => {
      const agentPayload = payload as AgentEventPayload;

      // Only handle events for our session
      if (agentPayload.sessionKey !== sessionKey) {
        return;
      }

      const currentRunId = agentPayload.runId;
      const stream = agentPayload.stream ?? "";

      // Handle lifecycle events for streaming state
      if (stream === "lifecycle") {
        const phase = agentPayload.data?.phase as string;
        if (phase === "start") {
          setIsStreaming(true);
          setRunId(currentRunId);
          setStreamText("");
        } else if (phase === "end" || phase === "error") {
          setIsStreaming(false);
          setStreamText("");
          setRunId(null);
        }
      }
      // Handle assistant stream for text content
      else if (stream === "assistant") {
        const text = agentPayload.data?.text as string;
        if (text) {
          setStreamText((prev) => prev + text);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [sessionKey, subscribe]);

  return { isStreaming, streamText, runId };
}
