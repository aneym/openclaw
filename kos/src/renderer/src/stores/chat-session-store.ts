/**
 * Chat Session Store — Unified per-session state management.
 *
 * Matches the web-ui's proven pattern (ui/src/ui/controllers/chat.ts):
 * - `messages` = server-authoritative history (full replacement from chat.history)
 * - `streamText` = separate streaming display (never mixed with messages)
 * - No polling during streaming (web-ui doesn't do this)
 * - On final: clear stream + reload history (history includes the final message)
 * - Optimistic user messages tracked separately, reconciled on history load
 */

import { createStore, type StoreApi } from "zustand/vanilla";
import type { ChatMessage } from "../types/message";
import { normalizeMessage } from "../gateway/normalize";
import { klog } from "../lib/klog";
import { sessionKeysMatch } from "../lib/session-keys";
import { generateUUID } from "../lib/uuid";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ActiveTool {
  toolCallId: string;
  toolName: string;
  toolInput: unknown;
  startedAt: number;
}

export interface QueuedMessage {
  id: string;
  text: string;
  attachments?: unknown[];
  createdAt: number;
}

export interface ChatSessionState {
  // Session identity
  sessionKey: string;
  chatId: string;

  // Messages (server-authoritative — full replacement from chat.history)
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;

  // Optimistic user messages (tracked separately for reconciliation)
  _optimisticIds: Set<string>;

  // Streaming (atomic group — all cleared together)
  runId: string | null;
  streamText: string;
  streamReasoning: string;
  streamStartedAt: number | null;
  activeTools: ActiveTool[];

  // Queue (messages waiting while agent is busy)
  queue: QueuedMessage[];
  sending: boolean;

  // Awaiting response (true from send until first delta)
  awaitingResponse: boolean;

  // Pending abort (for reconnect retry)
  pendingAbort: boolean;

  // Tool update throttling (80ms batching)
  _pendingToolUpdates: Array<{ type: "add" | "remove"; tool?: ActiveTool; toolCallId?: string }>;
  _toolThrottleTimer: ReturnType<typeof setTimeout> | null;

  // Request function reference (set by hook)
  _request: (<T>(method: string, params?: unknown) => Promise<T>) | null;

  // ─────────────────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────────────────

  /** Set the gateway request function (called by hook on mount) */
  setRequest: (request: <T>(method: string, params?: unknown) => Promise<T>) => void;

  /** Load message history from gateway (full replacement — server is authoritative) */
  loadHistory: () => Promise<void>;

  /** Handle incoming chat event (delta, final, aborted, error) */
  handleChatEvent: (payload: ChatEventPayload) => void;

  /** Handle incoming agent event (tool start/end) */
  handleAgentEvent: (payload: AgentEventPayload) => void;

  /** Send a message (or enqueue if streaming) */
  sendMessage: (text: string, attachments?: unknown[]) => Promise<void>;

  /** Send immediately, aborting current run if needed */
  sendNow: (text: string, attachments?: unknown[]) => Promise<void>;

  /** Enqueue a message */
  enqueue: (text: string, attachments?: unknown[]) => void;

  /** Dequeue and return first message */
  dequeue: () => QueuedMessage | undefined;

  /** Remove a message from queue */
  removeFromQueue: (messageId: string) => void;

  /** Abort current run */
  abort: () => Promise<void>;

  /** Clear pending abort flag */
  clearPendingAbort: () => void;

  /** Flush queue — send next message if not streaming */
  flushQueue: () => Promise<void>;

  /** Query gateway for active run status (reconnect catch-up) */
  queryChatStatus: () => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Payload Types
// ─────────────────────────────────────────────────────────────────────────────

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
  stream: "tool" | "assistant" | "reasoning" | "lifecycle" | "error" | null;
  data?: {
    phase?: "start" | "end" | "result" | "update" | "error";
    toolCallId?: string;
    // Gateway sends "name"; kOS convention is "toolName" — accept both
    toolName?: string;
    name?: string;
    toolInput?: unknown;
    args?: unknown;
    result?: unknown;
    text?: string;
    error?: string;
  };
}

interface SessionHistoryResponse {
  messages: unknown[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract text from a message object.
 * Matches web-ui's extractText pattern.
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
 * Separate `<think>` / `<thinking>` blocks from visible text.
 * Returns cleaned text and accumulated reasoning content.
 */
function separateThinkingFromText(text: string): { cleanText: string; reasoning: string } {
  const thinkRegex = /<\s*think(?:ing)?\s*>([\s\S]*?)<\s*\/\s*think(?:ing)?\s*>/gi;
  const parts: string[] = [];
  const clean = text.replace(thinkRegex, (_, content) => {
    const t = (content as string).trim();
    if (t) parts.push(t);
    return "";
  });
  // Strip unclosed opening tag at end (mid-stream)
  const cleanText = clean.replace(/<\s*think(?:ing)?\s*>[\s\S]*$/i, "").trim();
  return { cleanText, reasoning: parts.join("\n") };
}

// ─────────────────────────────────────────────────────────────────────────────
// Store Factory
// ─────────────────────────────────────────────────────────────────────────────

const stores = new Map<string, StoreApi<ChatSessionState>>();

/**
 * Create a chat session store for a given session key.
 */
function createChatSessionStore(sessionKey: string, chatId: string): StoreApi<ChatSessionState> {
  return createStore<ChatSessionState>((set, get) => ({
    // Identity
    sessionKey,
    chatId,

    // Messages
    messages: [],
    loading: true,
    error: null,

    // Optimistic tracking
    _optimisticIds: new Set(),

    // Streaming
    runId: null,
    streamText: "",
    streamReasoning: "",
    streamStartedAt: null,
    activeTools: [],

    // Queue
    queue: [],
    sending: false,

    // Awaiting response
    awaitingResponse: false,

    // Pending abort
    pendingAbort: false,

    // Tool throttle state
    _pendingToolUpdates: [],
    _toolThrottleTimer: null,

    // Request function (set by hook)
    _request: null,

    // ─────────────────────────────────────────────────────────────────────────
    // Actions
    // ─────────────────────────────────────────────────────────────────────────

    setRequest: (request) => {
      set({ _request: request });
    },

    loadHistory: async () => {
      const { sessionKey, _request } = get();

      if (!sessionKey || !_request) {
        set({ loading: false });
        return;
      }

      klog.session("loadHistory", { sessionKey });

      try {
        const history = await _request<SessionHistoryResponse>("chat.history", {
          sessionKey,
          limit: 200,
        });

        const { chatId } = get();
        const normalized = history.messages.map((m) => normalizeMessage(m, chatId));

        klog.session("loadHistory complete", {
          count: normalized.length,
          ids: normalized.map((m) => m.id),
        });

        // Snapshot state AFTER await (may have changed during network round-trip)
        const { _optimisticIds, messages: currentMessages } = get();

        // Preserve optimistic user messages not yet reflected in server history.
        // Race condition: user sends a message while loadHistory is in flight —
        // the server may not have the user message yet. Keep optimistic messages
        // appended until handleChatEvent clears _optimisticIds on final/aborted/error,
        // at which point the next loadHistory does a full replacement.
        const optimistic =
          _optimisticIds.size > 0 ? currentMessages.filter((m) => _optimisticIds.has(m.id)) : [];

        if (optimistic.length > 0) {
          const merged = [...normalized, ...optimistic];
          set({
            messages: merged,
            loading: false,
            error: null,
            streamText: "",
            streamReasoning: "",
          });
        } else {
          // Full replacement — server is authoritative
          set({
            messages: normalized,
            loading: false,
            error: null,
            streamText: "",
            streamReasoning: "",
            _optimisticIds: new Set(),
          });
        }
      } catch (err) {
        klog.sessionError("loadHistory failed", err);
        set({
          loading: false,
          error: err instanceof Error ? err.message : "Failed to fetch messages",
        });
      }
    },

    handleChatEvent: (payload) => {
      const state = get();

      // Only handle events for our session (normalize keys for comparison)
      if (!sessionKeysMatch(payload.sessionKey, state.sessionKey)) {
        return;
      }

      // Final from another run (e.g. sub-agent): just reload history
      if (payload.runId && state.runId && payload.runId !== state.runId) {
        if (payload.state === "final") {
          klog.streaming("final from different run, reloading history");
          void state.loadHistory().then(() => state.flushQueue());
        }
        return;
      }

      if (payload.state === "delta") {
        // Clear awaitingResponse on first delta
        if (get().awaitingResponse) {
          klog.streaming("first delta received, clearing awaitingResponse");
          set({ awaitingResponse: false });
        }

        // Adopt runId from incoming deltas when runId is null (e.g. after reconnect)
        // This makes the stop button appear instantly
        if (!state.runId && payload.runId) {
          klog.streaming("adopting runId", payload.runId);
          set({
            runId: payload.runId,
            streamStartedAt: Date.now(),
            streamText: "",
            streamReasoning: "",
          });
        }

        // Update cumulative stream text, extracting <think> tags into reasoning.
        // Length monotonicity check (web-ui pattern): only accept longer text
        // to prevent backwards-running text from out-of-order events.
        const nextText = extractText(payload.message);
        if (typeof nextText === "string") {
          const { cleanText, reasoning } = separateThinkingFromText(nextText);
          set((s) => {
            const updates: Partial<ChatSessionState> = {};
            if (!s.streamText || cleanText.length >= s.streamText.length) {
              updates.streamText = cleanText;
            }
            if (reasoning && (!s.streamReasoning || reasoning.length >= s.streamReasoning.length)) {
              updates.streamReasoning = reasoning;
            }
            return Object.keys(updates).length > 0 ? updates : s;
          });
        }
      } else if (
        payload.state === "final" ||
        payload.state === "aborted" ||
        payload.state === "error"
      ) {
        klog.streaming(`run ended (${payload.state})`, {
          existingMsgCount: state.messages.length,
        });

        // Cancel any pending tool throttle timer
        if (state._toolThrottleTimer) clearTimeout(state._toolThrottleTimer);

        // For "final": keep streamText as a bridge to prevent flash between
        // "stream cleared" and "history loaded". loadHistory clears it.
        // For "aborted"/"error": clear everything (no final message coming).
        const keepBridgeText = payload.state === "final";
        set({
          runId: null,
          streamStartedAt: null,
          activeTools: [],
          pendingAbort: false,
          awaitingResponse: false,
          _pendingToolUpdates: [],
          _toolThrottleTimer: null,
          // Clear optimistic IDs — server has the user message by now.
          // This lets the subsequent loadHistory do a full replacement.
          _optimisticIds: new Set(),
          ...(keepBridgeText ? {} : { streamText: "", streamReasoning: "" }),
          error: payload.state === "error" ? (payload.errorMessage ?? "chat error") : null,
        });

        // Reload history (includes the final message) then flush queue.
        void state.loadHistory().then(() => state.flushQueue());
      }
    },

    handleAgentEvent: (payload) => {
      const state = get();

      // Only handle events for our session (normalize keys for comparison)
      if (!sessionKeysMatch(payload.sessionKey, state.sessionKey)) {
        return;
      }

      // Accumulate reasoning text from reasoning events
      if (payload.stream === "reasoning" && payload.data?.text) {
        const text = payload.data.text as string;
        set((s) => {
          if (!s.streamReasoning || text.length >= s.streamReasoning.length) {
            return { streamReasoning: text };
          }
          return s;
        });
        return;
      }

      // Track tool execution start/end with 80ms throttling
      if (payload.stream === "tool" && payload.data) {
        const { phase, toolCallId } = payload.data;
        // Gateway sends "name" and "args"; accept both gateway and kOS field names
        const toolName = (payload.data.toolName ?? payload.data.name) as string | undefined;
        const toolInput = payload.data.toolInput ?? payload.data.args;

        if (phase === "start" && toolCallId && toolName) {
          klog.streaming("tool started", { toolCallId, toolName });
          // Queue the add operation
          const pendingUpdates = [
            ...get()._pendingToolUpdates,
            {
              type: "add" as const,
              tool: { toolCallId, toolName, toolInput, startedAt: Date.now() },
            },
          ];
          set({ _pendingToolUpdates: pendingUpdates });
        } else if ((phase === "end" || phase === "result") && toolCallId) {
          klog.streaming("tool ended", { toolCallId });
          // Queue the remove operation
          const pendingUpdates = [
            ...get()._pendingToolUpdates,
            { type: "remove" as const, toolCallId },
          ];
          set({ _pendingToolUpdates: pendingUpdates });
        }

        // Schedule flush if not already scheduled
        if (!get()._toolThrottleTimer) {
          const timer = setTimeout(() => {
            // Apply all pending updates atomically
            const updates = get()._pendingToolUpdates;
            if (updates.length === 0) {
              set({ _toolThrottleTimer: null });
              return;
            }

            set((s) => {
              let tools = [...s.activeTools];
              for (const update of updates) {
                if (update.type === "add" && update.tool) {
                  tools.push(update.tool);
                } else if (update.type === "remove" && update.toolCallId) {
                  tools = tools.filter((t) => t.toolCallId !== update.toolCallId);
                }
              }
              return {
                activeTools: tools,
                _pendingToolUpdates: [],
                _toolThrottleTimer: null,
              };
            });
          }, 80);
          set({ _toolThrottleTimer: timer });
        }
      }
    },

    sendMessage: async (text, attachments) => {
      const state = get();
      const trimmed = text.trim();

      if (!trimmed && (!attachments || attachments.length === 0)) {
        return;
      }

      // If streaming, enqueue instead of sending
      if (state.runId) {
        klog.compose("queueing message (agent is streaming)");
        state.enqueue(trimmed, attachments);
        return;
      }

      // Send now
      await state.sendNow(trimmed, attachments);
    },

    sendNow: async (text, attachments) => {
      const { sessionKey, chatId, _request } = get();

      if (!_request) {
        klog.composeError("sendNow: no request function");
        return;
      }

      const messageId = generateUUID();
      const trimmed = text.trim();

      if (!trimmed && (!attachments || attachments.length === 0)) {
        return;
      }

      klog.compose("sendNow", { sessionKey, messageId, textLength: trimmed.length });

      // Add optimistic user message so it appears immediately in the UI.
      // Track its ID so we can reconcile when history loads.
      const optimisticMsg: ChatMessage = {
        id: `optimistic-${messageId}`,
        role: "user",
        parts: [{ type: "text", text: trimmed }],
        createdAt: Date.now(),
        chatId,
      };

      set((s) => ({
        messages: [...s.messages, optimisticMsg],
        _optimisticIds: new Set([...s._optimisticIds, optimisticMsg.id]),
        sending: true,
        awaitingResponse: true,
      }));

      try {
        // Build attachments array for API
        const apiAttachments = attachments?.map((att) => {
          const img = att as { dataUrl?: string };
          if (img.dataUrl) {
            return {
              type: "image" as const,
              mimeType: "image/jpeg",
              data: img.dataUrl.replace(/^data:image\/[a-z]+;base64,/, ""),
            };
          }
          return att;
        });

        const response = await _request<{ runId?: string }>("chat.send", {
          sessionKey,
          message: trimmed,
          deliver: false,
          idempotencyKey: messageId,
          ...(apiAttachments && apiAttachments.length > 0 && { attachments: apiAttachments }),
        });

        klog.compose("send complete", { responseRunId: response?.runId });

        // Adopt runId from send response — enables abort button immediately
        const respondedRunId = response?.runId ?? messageId;
        set({ runId: respondedRunId, streamStartedAt: Date.now() });
      } catch (err) {
        klog.composeError("send failed", err);
        // Remove the optimistic message on failure
        set((s) => ({
          messages: s.messages.filter((m) => m.id !== optimisticMsg.id),
          _optimisticIds: (() => {
            const next = new Set(s._optimisticIds);
            next.delete(optimisticMsg.id);
            return next;
          })(),
          error: err instanceof Error ? err.message : "Send failed",
          awaitingResponse: false,
        }));
      } finally {
        set({ sending: false });
        // NOTE: awaitingResponse stays true — cleared on first delta by handleChatEvent
      }
    },

    enqueue: (text, attachments) => {
      const trimmed = text.trim();
      if (!trimmed && (!attachments || attachments.length === 0)) {
        return;
      }

      klog.compose("enqueue", { textLength: trimmed.length });

      set((s) => ({
        queue: [
          ...s.queue,
          {
            id: generateUUID(),
            text: trimmed,
            attachments,
            createdAt: Date.now(),
          },
        ],
      }));
    },

    dequeue: () => {
      const state = get();
      if (state.queue.length === 0) return undefined;

      const first = state.queue[0];
      set((s) => ({ queue: s.queue.slice(1) }));
      return first;
    },

    removeFromQueue: (messageId) => {
      set((s) => ({
        queue: s.queue.filter((m) => m.id !== messageId),
      }));
    },

    abort: async () => {
      const { sessionKey, _request, runId, awaitingResponse } = get();

      if (!runId && !awaitingResponse) {
        klog.compose("abort: no active run and not awaiting response");
        return;
      }

      if (!_request) {
        // Not connected — mark for retry
        klog.compose("abort: not connected, marking pending");
        set({ pendingAbort: true });
        return;
      }

      klog.compose("abort", { sessionKey, runId });

      try {
        // Abort with runId if available, sessionKey-only otherwise (matches web-ui)
        const params = runId ? { sessionKey, runId } : { sessionKey };
        await _request("chat.abort", params);
        klog.compose("abort complete");
        set({
          pendingAbort: false,
          awaitingResponse: false,
          runId: null,
          streamText: "",
          streamReasoning: "",
          streamStartedAt: null,
        });
      } catch (err) {
        klog.composeError("abort failed", err);
        // Mark for retry
        set({ pendingAbort: true });
      }
    },

    clearPendingAbort: () => {
      set({ pendingAbort: false });
    },

    queryChatStatus: async () => {
      const { sessionKey, _request } = get();
      if (!sessionKey || !_request) return;
      try {
        const res = await _request<{
          activeRun: { runId: string; streamText: string | null } | null;
        }>("chat.status", { sessionKey });
        if (res?.activeRun?.runId) {
          const raw = res.activeRun.streamText ?? "";
          const { cleanText, reasoning } = separateThinkingFromText(raw);
          set({
            runId: res.activeRun.runId,
            streamText: cleanText,
            streamReasoning: reasoning,
            streamStartedAt: Date.now(),
          });
        }
      } catch {
        // Older gateways may not support chat.status — graceful degradation
      }
    },

    flushQueue: async () => {
      const state = get();

      // Don't flush if streaming or already sending
      if (state.runId || state.sending) {
        return;
      }

      // Get next message from queue
      const next = state.dequeue();
      if (!next) return;

      klog.compose("flushQueue: sending queued message", { id: next.id });

      // Send the queued message
      await state.sendNow(next.text, next.attachments);
    },
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get or create a chat session store for a given session key.
 * Store is keyed by chatId only (stable) - sessionKey can change during sync.
 */
export function getChatSessionStore(
  sessionKey: string,
  chatId: string,
): StoreApi<ChatSessionState> {
  // Key by chatId only - sessionKey can change when gateway returns canonical form
  const key = chatId;

  if (!stores.has(key)) {
    klog.session("creating chat session store", { sessionKey, chatId, storeKey: key });
    stores.set(key, createChatSessionStore(sessionKey, chatId));
  } else {
    const store = stores.get(key)!;
    const currentSessionKey = store.getState().sessionKey;
    if (currentSessionKey !== sessionKey) {
      klog.session("updating session store sessionKey", {
        chatId,
        oldKey: currentSessionKey,
        newKey: sessionKey,
      });
      store.setState({ sessionKey });
    }
  }

  return stores.get(key)!;
}

/**
 * Cleanup a chat session store.
 * Call when component unmounts.
 */
export function cleanupChatSessionStore(_sessionKey: string, chatId: string): void {
  // Key by chatId only (sessionKey param kept for API compatibility)
  const key = chatId;
  if (stores.has(key)) {
    klog.session("cleaning up chat session store", { chatId });
    stores.delete(key);
  }
}

/**
 * Get all active session store keys (for debugging).
 */
export function getActiveChatSessionKeys(): string[] {
  return Array.from(stores.keys());
}
