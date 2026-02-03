/**
 * useMessages hook — fetch message history and subscribe to new messages via gateway.
 *
 * This follows the web UI's pattern:
 * - Load history on mount and when connected
 * - On 'final' chat events, reload history from the server
 * - On 'delta' events, do nothing (streaming is handled by useStreaming)
 * - Never add messages directly from events - let history be the source of truth
 */

import { useState, useEffect, useCallback, useRef } from "react";
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

// Debug logging for streaming events (set to true to enable)
const DEBUG_STREAMING = false;
function debugLog(...args: unknown[]) {
  if (DEBUG_STREAMING) {
    console.log("[useMessages]", ...args);
  }
}

export function useMessages(sessionKey: string, threadId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { request, subscribe, connected } = useGatewayStore();

  // Track current runId to detect when runs complete
  const currentRunIdRef = useRef<string | null>(null);

  // Function to load history from gateway
  const loadHistory = useCallback(async () => {
    if (!sessionKey || !connected) {
      return;
    }

    debugLog("Loading history for session:", sessionKey);

    try {
      const history = await request<SessionHistoryResponse>("chat.history", {
        sessionKey,
        limit: 200,
      });

      debugLog("History loaded, message count:", history.messages.length);
      history.messages.forEach((m, i) => {
        const msg = m as Record<string, unknown>;
        debugLog(`  [${i}] id=${msg.id}, role=${msg.role}`);
      });

      const normalized = history.messages.map((m) => normalizeMessage(m, threadId));
      setMessages(normalized);
      setError(null);
    } catch (err) {
      console.error("[useMessages] failed to fetch history:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch messages");
    }
  }, [sessionKey, threadId, request, connected]);

  // Add a message locally (for optimistic user messages)
  const addMessage = useCallback((message: ChatMessage) => {
    debugLog("Adding optimistic message:", { id: message.id, role: message.role });
    setMessages((prev) => {
      // Check if message already exists
      const existingIndex = prev.findIndex((m) => m.id === message.id);
      if (existingIndex >= 0) {
        debugLog("Updating existing optimistic message at index", existingIndex);
        const updated = [...prev];
        updated[existingIndex] = message;
        return updated;
      }
      debugLog("Appending optimistic message, total will be", prev.length + 1);
      return [...prev, message];
    });
  }, []);

  // Initial history load when connected
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
    loadHistory().finally(() => setLoading(false));
  }, [sessionKey, connected, loadHistory]);

  // Subscribe to chat events
  useEffect(() => {
    if (!sessionKey) {
      return;
    }

    const unsubscribe = subscribe("chat", (payload) => {
      const event = payload as ChatEventPayload;

      debugLog("Received chat event:", {
        state: event.state,
        runId: event.runId,
        sessionKey: event.sessionKey,
        hasMessage: !!event.message,
        messageId: event.message ? (event.message as Record<string, unknown>).id : undefined,
      });

      if (event.sessionKey !== sessionKey) {
        debugLog("Ignoring event for different session");
        return;
      }

      // Track the current run
      if (event.state === "delta" && event.runId) {
        if (currentRunIdRef.current !== event.runId) {
          debugLog("New run started:", event.runId);
          currentRunIdRef.current = event.runId;
        }
        // Don't process delta events for messages - streaming text is handled by useStreaming
        return;
      }

      // On 'final', 'aborted', or 'error' - reload history from server
      // This ensures we get the complete, server-authoritative message list
      if (event.state === "final" || event.state === "aborted" || event.state === "error") {
        debugLog(`Run ended (${event.state}), reloading history`);
        currentRunIdRef.current = null;

        // Reload history to get the final message from the server
        // This matches the web UI's pattern and ensures consistency
        void loadHistory();
      }
    });

    return unsubscribe;
  }, [sessionKey, subscribe, loadHistory]);

  return { messages, loading, error, addMessage };
}
