/**
 * useChatSession — Hook for unified chat session state management.
 *
 * This hook:
 * 1. Gets or creates the per-session store
 * 2. Sets up single subscription for "chat" and "agent" events
 * 3. Handles initial history load when connected
 * 4. Retries pending aborts on reconnect
 * 5. Cleans up store on unmount
 *
 * Usage:
 * ```tsx
 * const {
 *   messages, loading, error,
 *   runId, streamText, activeTools,
 *   queue, sending,
 *   sendMessage, abort, enqueue,
 * } = useChatSession(sessionKey, chatId)
 *
 * const isStreaming = runId !== null
 * ```
 */

import type { StoreApi } from "zustand/vanilla";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { ChatMessage } from "../types/message";
import { klog } from "../lib/klog";
import {
  getChatSessionStore,
  cleanupChatSessionStore,
  type ChatSessionState,
  type ActiveTool,
  type QueuedMessage,
} from "../stores/chat-session-store";
import { useGatewayStore } from "../stores/gateway-store";

interface UseChatSessionReturn {
  // Messages (server-authoritative)
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;

  // Streaming state
  runId: string | null;
  streamText: string;
  streamReasoning: string;
  streamStartedAt: number | null;
  activeTools: ActiveTool[];
  awaitingResponse: boolean;

  // Queue
  queue: QueuedMessage[];
  sending: boolean;

  // Derived
  isStreaming: boolean;

  // Actions
  sendMessage: (text: string, attachments?: unknown[]) => Promise<void>;
  sendNow: (text: string, attachments?: unknown[]) => Promise<void>;
  abort: () => Promise<void>;
  enqueue: (text: string, attachments?: unknown[]) => void;
  removeFromQueue: (messageId: string) => void;
}

// Default empty state for when no store exists
const emptyState: Pick<
  UseChatSessionReturn,
  | "messages"
  | "loading"
  | "error"
  | "runId"
  | "streamText"
  | "streamReasoning"
  | "streamStartedAt"
  | "activeTools"
  | "awaitingResponse"
  | "queue"
  | "sending"
> = {
  messages: [],
  loading: false,
  error: null,
  runId: null,
  streamText: "",
  streamReasoning: "",
  streamStartedAt: null,
  activeTools: [],
  awaitingResponse: false,
  queue: [],
  sending: false,
};

// No-op actions for when no store exists
const emptyActions = {
  sendMessage: async () => {},
  sendNow: async () => {},
  abort: async () => {},
  enqueue: () => {},
  removeFromQueue: () => {},
};

// Stable selectors (defined outside component to avoid re-creation)
const selectMessages = (s: ChatSessionState) => s.messages;
const selectLoading = (s: ChatSessionState) => s.loading;
const selectError = (s: ChatSessionState) => s.error;
const selectRunId = (s: ChatSessionState) => s.runId;
const selectStreamText = (s: ChatSessionState) => s.streamText;
const selectStreamReasoning = (s: ChatSessionState) => s.streamReasoning;
const selectStreamStartedAt = (s: ChatSessionState) => s.streamStartedAt;
const selectActiveTools = (s: ChatSessionState) => s.activeTools;
const selectAwaitingResponse = (s: ChatSessionState) => s.awaitingResponse;
const selectQueue = (s: ChatSessionState) => s.queue;
const selectSending = (s: ChatSessionState) => s.sending;

/**
 * Hook to use a specific selector from a store.
 * Uses useSyncExternalStore for optimal React 18+ subscription handling.
 */
function useStoreSelector<T>(
  store: StoreApi<ChatSessionState> | null,
  selector: (state: ChatSessionState) => T,
  fallback: T,
): T {
  const subscribeCallback = useCallback(
    (onStoreChange: () => void) => {
      if (!store) return () => {};
      return store.subscribe(onStoreChange);
    },
    [store],
  );

  const getSnapshot = useCallback(() => {
    if (!store) return fallback;
    return selector(store.getState());
  }, [store, selector, fallback]);

  return useSyncExternalStore(subscribeCallback, getSnapshot, getSnapshot);
}

export function useChatSession(sessionKey: string, chatId: string): UseChatSessionReturn {
  // Get gateway store methods with individual selectors (avoids re-renders)
  const subscribe = useGatewayStore((s) => s.subscribe);
  const connected = useGatewayStore((s) => s.connected);
  const request = useGatewayStore((s) => s.request);

  // Get or create the session store
  const store = useMemo(() => {
    if (!sessionKey || !chatId) {
      return null;
    }
    return getChatSessionStore(sessionKey, chatId);
  }, [sessionKey, chatId]);

  // Track previous connected state for reconnect detection
  const wasConnectedRef = useRef(false);

  // Set request function when store or request changes
  useEffect(() => {
    if (!store || !request) return;
    store.getState().setRequest(request);
  }, [store, request]);

  // Subscribe to events and manage lifecycle
  useEffect(() => {
    if (!store || !sessionKey) {
      return;
    }

    const state = store.getState();

    klog.session("useChatSession: subscribing", { sessionKey, chatId, connected });

    // Subscribe to chat events
    const unsubChat = subscribe("chat", (payload) => {
      state.handleChatEvent(payload as Parameters<typeof state.handleChatEvent>[0]);
    });

    // Subscribe to agent events
    const unsubAgent = subscribe("agent", (payload) => {
      state.handleAgentEvent(payload as Parameters<typeof state.handleAgentEvent>[0]);
    });

    return () => {
      klog.session("useChatSession: unsubscribing", { sessionKey, chatId });
      unsubChat();
      unsubAgent();
    };
  }, [store, sessionKey, chatId, subscribe]);

  // Load history when connected (and on reconnect with status catch-up)
  useEffect(() => {
    if (!store || !sessionKey) return;

    const state = store.getState();
    const justReconnected = connected && !wasConnectedRef.current;

    if (connected) {
      if (justReconnected) {
        // Reconnect: query active run FIRST (web-ui pattern), then load history
        klog.session("useChatSession: reconnected, querying chat status first", { sessionKey });
        void state.queryChatStatus().then(() => {
          void state.loadHistory();
          if (state.pendingAbort && store.getState().runId) {
            void state.abort();
          }
        });
      } else {
        // Initial connect
        klog.session("useChatSession: connected, loading history", { sessionKey });
        void state.loadHistory();
      }
    }

    wasConnectedRef.current = connected;
  }, [store, sessionKey, connected]);

  // Cleanup store on unmount only (not on sessionKey/chatId changes).
  // The store is keyed by chatId (stable), so cleanup should only happen
  // when the component actually unmounts. Use a ref to capture latest values
  // without adding them as effect dependencies.
  const cleanupRef = useRef({ sessionKey, chatId });
  cleanupRef.current = { sessionKey, chatId };

  useEffect(() => {
    return () => {
      const { sessionKey: sk, chatId: cid } = cleanupRef.current;
      if (sk && cid) {
        klog.session("useChatSession: cleanup on unmount", { sessionKey: sk, chatId: cid });
        cleanupChatSessionStore(sk, cid);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Use store selectors with stable selector functions
  const messages = useStoreSelector(store, selectMessages, emptyState.messages);
  const loading = useStoreSelector(store, selectLoading, emptyState.loading);
  const error = useStoreSelector(store, selectError, emptyState.error);
  const runId = useStoreSelector(store, selectRunId, emptyState.runId);
  const streamText = useStoreSelector(store, selectStreamText, emptyState.streamText);
  const streamReasoning = useStoreSelector(
    store,
    selectStreamReasoning,
    emptyState.streamReasoning,
  );
  const streamStartedAt = useStoreSelector(
    store,
    selectStreamStartedAt,
    emptyState.streamStartedAt,
  );
  const activeTools = useStoreSelector(store, selectActiveTools, emptyState.activeTools);
  const awaitingResponse = useStoreSelector(
    store,
    selectAwaitingResponse,
    emptyState.awaitingResponse,
  );
  const queue = useStoreSelector(store, selectQueue, emptyState.queue);
  const sending = useStoreSelector(store, selectSending, emptyState.sending);

  // No polling during streaming — web-ui doesn't do this.
  // Streaming text comes via events (handleChatEvent deltas).
  // History is loaded once on final (includes all messages + tool results).
  // Polling during streaming caused duplicate messages because the in-progress
  // assistant message from history overlapped with streamText.

  // Stable action references (get from store state)
  const actions = useMemo(() => {
    if (!store) {
      return emptyActions;
    }
    const state = store.getState();
    return {
      sendMessage: state.sendMessage,
      sendNow: state.sendNow,
      abort: state.abort,
      enqueue: state.enqueue,
      removeFromQueue: state.removeFromQueue,
    };
  }, [store]);

  return {
    // State
    messages,
    loading,
    error,
    runId,
    streamText,
    streamReasoning,
    streamStartedAt,
    activeTools,
    awaitingResponse,
    queue,
    sending,

    // Derived
    isStreaming: runId !== null,

    // Actions
    ...actions,
  };
}
