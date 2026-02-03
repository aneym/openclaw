import { useEffect, useRef, useState } from "react";
import { useGatewayStore } from "../stores/gateway-store";

/** Individual selectors to avoid object creation on every render */
export function useGatewayConnected() {
  return useGatewayStore((s) => s.connected);
}

export function useGatewayError() {
  return useGatewayStore((s) => s.error);
}

export function useGatewayConnect() {
  return useGatewayStore((s) => s.connect);
}

export function useGatewayDisconnect() {
  return useGatewayStore((s) => s.disconnect);
}

export function useGatewayRequest() {
  return useGatewayStore((s) => s.request);
}

export function useGatewayEvent(event: string, handler: (payload: unknown) => void) {
  const subscribe = useGatewayStore((s) => s.subscribe);
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    const stableHandler = (payload: unknown) => handlerRef.current(payload);
    const unsubscribe = subscribe(event, stableHandler);
    return unsubscribe;
  }, [event, subscribe]);
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
  seq: number;
  stream: "lifecycle" | "tool" | "assistant" | "error" | string;
  ts: number;
  data: Record<string, unknown>;
  sessionKey?: string;
}

export function useSession(sessionKey: string) {
  const [messages, setMessages] = useState<unknown[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const subscribe = useGatewayStore((s) => s.subscribe);

  useEffect(() => {
    const unsubscribes = [
      // Subscribe to chat events for messages
      subscribe("chat", (payload: unknown) => {
        const p = payload as ChatEventPayload;
        if (p?.sessionKey === sessionKey && p.message) {
          setMessages((prev) => [...prev, p.message]);
        }
      }),
      // Subscribe to agent events for streaming lifecycle
      subscribe("agent", (payload: unknown) => {
        const p = payload as AgentEventPayload;
        if (p?.sessionKey !== sessionKey) return;

        // Handle lifecycle events for streaming state
        if (p.stream === "lifecycle") {
          const phase = p.data?.phase as string;
          if (phase === "start") {
            setIsStreaming(true);
          } else if (phase === "end" || phase === "error") {
            setIsStreaming(false);
          }
        }
      }),
    ];

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [sessionKey, subscribe]);

  return { messages, isStreaming };
}
