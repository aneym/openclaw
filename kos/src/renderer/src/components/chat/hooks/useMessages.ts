/**
 * useMessages hook — fetch message history and subscribe to new messages via gateway.
 */

import { useState, useEffect } from "react";
import type { ChatMessage } from "../../../types/message";
import { normalizeMessage } from "../../../gateway/normalize";
import { useGatewayStore } from "../../../stores/gateway-store";

interface SessionHistoryResponse {
  messages: unknown[];
}

interface ChatEventPayload {
  runId: string;
  sessionKey: string;
  state: "delta" | "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
}

export function useMessages(sessionKey: string, threadId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { request, subscribe, connected } = useGatewayStore();

  // Fetch history when connected
  useEffect(() => {
    if (!sessionKey) {
      setLoading(false);
      return;
    }

    // Wait for gateway connection before fetching
    if (!connected) {
      return;
    }

    setLoading(true);
    setError(null);

    request<SessionHistoryResponse>("chat.history", { sessionKey, limit: 200 })
      .then((history) => {
        const normalized = history.messages.map((m) => normalizeMessage(m, threadId));
        setMessages(normalized);
        setLoading(false);
      })
      .catch((err) => {
        console.error("[useMessages] failed to fetch history:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch messages");
        setLoading(false);
      });
  }, [sessionKey, threadId, request, connected]);

  // Subscribe to chat events (streaming messages)
  useEffect(() => {
    if (!sessionKey) {
      return;
    }

    const unsubscribe = subscribe("chat", (payload) => {
      const event = payload as ChatEventPayload;
      if (event.sessionKey === sessionKey && event.message) {
        const normalized = normalizeMessage(event.message, threadId);
        setMessages((prev) => {
          // Replace existing message or append new one
          const existingIndex = prev.findIndex((m) => m.id === normalized.id);
          if (existingIndex >= 0) {
            const updated = [...prev];
            updated[existingIndex] = normalized;
            return updated;
          }
          return [...prev, normalized];
        });
      }
    });

    return unsubscribe;
  }, [sessionKey, threadId, subscribe]);

  return { messages, loading, error };
}
