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
import { klog } from "../../../lib/klog";
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

interface UseMessagesOptions {
  /**
   * Called after history reload completes (e.g., after a streaming run ends).
   * Use this to clear streaming state to avoid flash where streaming text
   * disappears before final message arrives.
   */
  onHistoryReload?: () => void;
}

export function useMessages(sessionKey: string, chatId: string, options: UseMessagesOptions = {}) {
  const { onHistoryReload } = options;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { request, subscribe, connected } = useGatewayStore();

  // Track current runId to detect when runs complete
  const currentRunIdRef = useRef<string | null>(null);

  // Function to load history from gateway
  const loadHistory = useCallback(async () => {
    if (!sessionKey || !connected) {
      return;
    }

    klog.messages("Loading history for session:", sessionKey);

    try {
      const history = await request<SessionHistoryResponse>("chat.history", {
        sessionKey,
        limit: 200,
      });

      klog.messages("History loaded, message count:", history.messages.length);
      history.messages.forEach((m, i) => {
        const msg = m as Record<string, unknown>;
        klog.messages(`  [${i}] id=${msg.id}, role=${msg.role}`);
      });

      const normalized = history.messages.map((m) => normalizeMessage(m, chatId));
      setMessages(normalized);
      setError(null);
    } catch (err) {
      console.error("[useMessages] failed to fetch history:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch messages");
    }
  }, [sessionKey, chatId, request, connected]);

  // Add a message locally (for optimistic user messages)
  const addMessage = useCallback((message: ChatMessage) => {
    klog.messages("Adding optimistic message:", { id: message.id, role: message.role });
    setMessages((prev) => {
      // Check if message already exists
      const existingIndex = prev.findIndex((m) => m.id === message.id);
      if (existingIndex >= 0) {
        klog.messages("Updating existing optimistic message at index", existingIndex);
        const updated = [...prev];
        updated[existingIndex] = message;
        return updated;
      }
      klog.messages("Appending optimistic message, total will be", prev.length + 1);
      return [...prev, message];
    });
  }, []);

  // Initial history load when connected
  useEffect(() => {
    klog.messages("useMessages effect triggered", {
      sessionKey: sessionKey || "(empty)",
      connected,
      messageCount: messages.length,
    });

    if (!sessionKey) {
      klog.messages("No sessionKey, skipping history load");
      setInitialLoading(false);
      return;
    }

    // Wait for gateway connection before fetching
    if (!connected) {
      klog.messages("Not connected, waiting for gateway");
      return;
    }

    // Only show loading state on initial load (when messages are empty)
    if (messages.length === 0) {
      setInitialLoading(true);
    }
    klog.messages("Loading history for sessionKey:", sessionKey);
    loadHistory().finally(() => setInitialLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run on sessionKey/connected change, not messages
  }, [sessionKey, connected, loadHistory]);

  // Subscribe to chat events
  useEffect(() => {
    if (!sessionKey) {
      return;
    }

    const unsubscribe = subscribe("chat", (payload) => {
      const event = payload as ChatEventPayload;

      klog.messages("Received chat event:", {
        state: event.state,
        runId: event.runId,
        sessionKey: event.sessionKey,
        hasMessage: !!event.message,
        messageId: event.message ? (event.message as Record<string, unknown>).id : undefined,
      });

      if (event.sessionKey !== sessionKey) {
        klog.messages("Ignoring event for different session");
        return;
      }

      // Track the current run
      if (event.state === "delta" && event.runId) {
        if (currentRunIdRef.current !== event.runId) {
          klog.messages("New run started:", event.runId);
          currentRunIdRef.current = event.runId;
        }
        // Don't process delta events for messages - streaming text is handled by useStreaming
        return;
      }

      // On 'final', 'aborted', or 'error' - reload history from server
      // This ensures we get the complete, server-authoritative message list
      if (event.state === "final" || event.state === "aborted" || event.state === "error") {
        klog.messages(`Run ended (${event.state}), reloading history`);
        currentRunIdRef.current = null;

        // Reload history to get the final message from the server
        // This matches the web UI's pattern and ensures consistency
        // Call onHistoryReload after load completes to clear streaming state
        void loadHistory().then(() => {
          onHistoryReload?.();
        });
      }
    });

    return unsubscribe;
  }, [sessionKey, subscribe, loadHistory, onHistoryReload]);

  return { messages, loading: initialLoading, error, addMessage };
}
