import type { GatewayBrowserClient } from "../gateway";
import type { ThreadState } from "../thread-state";
import type { ChatAttachment } from "../ui-types";
import {
  extractRawText,
  extractText,
  normalizeReasoningText,
  separateThinkingFromText,
} from "../chat/message-extract";
import { sessionKeysMatch } from "../session-keys";
import { generateUUID } from "../uuid";

// ── Pending abort tracking ──────────────────────────────────────────
// When the user clicks stop while disconnected (or the abort RPC fails),
// the intent is preserved here and retried after reconnect.
const pendingAbortSessionKeys = new Set<string>();

export function markAbortPending(sessionKey: string) {
  pendingAbortSessionKeys.add(sessionKey);
}

export function clearAbortPending(sessionKey: string) {
  pendingAbortSessionKeys.delete(sessionKey);
}

export function hasPendingAbort(sessionKey: string): boolean {
  return pendingAbortSessionKeys.has(sessionKey);
}
// ─────────────────────────────────────────────────────────────────────

export type ChatState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  sessionKey: string;
  /**
   * Internal: monotonic token for `loadChatHistory()` so stale async responses
   * don't overwrite the active pane when the user switches sessions/panes.
   */
  chatHistoryLoadId?: string | null;
  chatLoading: boolean;
  chatMessages: unknown[];
  chatThinkingLevel: string | null;
  chatSending: boolean;
  chatMessage: string;
  chatAttachments: ChatAttachment[];
  chatRunId: string | null;
  chatStream: string | null;
  chatStreamReasoning: string | null;
  chatStreamStartedAt: number | null;
  lastError: string | null;
};

export type ChatEventPayload = {
  runId: string;
  sessionKey: string;
  state: "delta" | "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
};

export async function loadChatHistory(state: ChatState) {
  if (!state.client || !state.connected) {
    return;
  }
  const loadId = generateUUID();
  const requestedSessionKey = state.sessionKey;
  state.chatHistoryLoadId = loadId;
  state.chatLoading = true;
  state.lastError = null;
  try {
    let res: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        res = await state.client.request(
          "chat.history",
          {
            sessionKey: requestedSessionKey,
            limit: 200,
          },
          { timeoutMs: 20_000 },
        );
        break;
      } catch (err) {
        const isStale =
          state.chatHistoryLoadId !== loadId ||
          !sessionKeysMatch(requestedSessionKey, state.sessionKey);
        if (isStale) {
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        if (attempt === 0 && message.includes("gateway request timed out")) {
          continue;
        }
        throw err;
      }
    }
    if (!res) {
      return;
    }

    // Ignore stale results (session changed or a newer request started).
    if (state.chatHistoryLoadId !== loadId) {
      return;
    }
    if (!sessionKeysMatch(requestedSessionKey, state.sessionKey)) {
      return;
    }

    const serverMessages = Array.isArray((res as { messages?: unknown }).messages)
      ? ((res as { messages?: unknown }).messages as unknown[])
      : [];
    state.chatMessages = mergeChatMessages({
      localMessages: state.chatMessages,
      serverMessages,
    });
    const thinkingLevel = (res as { thinkingLevel?: unknown }).thinkingLevel;
    state.chatThinkingLevel = typeof thinkingLevel === "string" ? thinkingLevel : null;
  } catch (err) {
    if (state.chatHistoryLoadId !== loadId) {
      return;
    }
    if (!sessionKeysMatch(requestedSessionKey, state.sessionKey)) {
      return;
    }
    state.lastError = String(err);
  } finally {
    // Only clear loading if this is still the most recent request.
    if (state.chatHistoryLoadId === loadId) {
      state.chatLoading = false;
    }
  }
}

function isOptimisticMessage(message: unknown): boolean {
  if (!message || typeof message !== "object") {
    return false;
  }
  const msg = message as { _optimistic?: unknown; _streamFinal?: unknown };
  return Boolean(msg._optimistic) || Boolean(msg._streamFinal);
}

function messagesEquivalentForMerge(a: unknown, b: unknown): boolean {
  if (!a || typeof a !== "object" || !b || typeof b !== "object") {
    return false;
  }
  const aRole = (a as { role?: unknown }).role;
  const bRole = (b as { role?: unknown }).role;
  if (aRole !== bRole) {
    return false;
  }
  const aText = extractText(a);
  const bText = extractText(b);
  if (typeof aText === "string" && typeof bText === "string") {
    return aText.trim() === bText.trim();
  }
  return false;
}

export function mergeChatMessages(params: {
  localMessages: unknown[];
  serverMessages: unknown[];
}): unknown[] {
  const localMessages = Array.isArray(params.localMessages) ? params.localMessages : [];
  const serverMessages = Array.isArray(params.serverMessages) ? params.serverMessages : [];

  // If the server returns empty history (e.g. transcript not flushed yet),
  // never wipe non-empty local state — that causes message "flashes".
  if (serverMessages.length === 0 && localMessages.length > 0) {
    return localMessages;
  }

  const optimistic = localMessages.filter(isOptimisticMessage);
  if (optimistic.length === 0) {
    return serverMessages;
  }

  const merged = [...serverMessages];
  for (const msg of optimistic) {
    const exists = serverMessages.some((serverMsg) => messagesEquivalentForMerge(serverMsg, msg));
    if (!exists) {
      merged.push(msg);
    }
  }
  return merged;
}

function dataUrlToBase64(dataUrl: string): { content: string; mimeType: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    return null;
  }
  return { mimeType: match[1], content: match[2] };
}

export async function sendChatMessage(
  state: ChatState,
  message: string,
  attachments?: ChatAttachment[],
): Promise<string | null> {
  if (!state.client || !state.connected) {
    return null;
  }
  const msg = message.trim();
  const hasAttachments = attachments && attachments.length > 0;
  if (!msg && !hasAttachments) {
    return null;
  }

  const runId = generateUUID();
  const now = Date.now();

  // Build user message content blocks
  const contentBlocks: Array<{ type: string; text?: string; source?: unknown }> = [];
  if (msg) {
    contentBlocks.push({ type: "text", text: msg });
  }
  // Add image previews to the message for display
  if (hasAttachments) {
    for (const att of attachments) {
      contentBlocks.push({
        type: "image",
        source: { type: "base64", media_type: att.mimeType, data: att.dataUrl },
      });
    }
  }

  state.chatMessages = [
    ...state.chatMessages,
    {
      role: "user",
      messageId: `client:${runId}:user`,
      content: contentBlocks,
      timestamp: now,
      _optimistic: true,
      _clientRunId: runId,
    },
  ];

  state.chatSending = true;
  state.lastError = null;
  state.chatRunId = runId;
  state.chatStream = "";
  state.chatStreamReasoning = "";
  state.chatStreamStartedAt = now;

  // Convert attachments to API format
  const apiAttachments = hasAttachments
    ? attachments
        .map((att) => {
          const parsed = dataUrlToBase64(att.dataUrl);
          if (!parsed) {
            return null;
          }
          return {
            type: "image",
            mimeType: parsed.mimeType,
            content: parsed.content,
          };
        })
        .filter((a): a is NonNullable<typeof a> => a !== null)
    : undefined;

  try {
    await state.client.request("chat.send", {
      sessionKey: state.sessionKey,
      message: msg,
      deliver: false,
      idempotencyKey: runId,
      attachments: apiAttachments,
    });
    return runId;
  } catch (err) {
    const error = String(err);
    state.chatRunId = null;
    state.chatStream = null;
    state.chatStreamReasoning = null;
    state.chatStreamStartedAt = null;
    state.lastError = error;
    state.chatMessages = [
      ...state.chatMessages,
      {
        role: "assistant",
        content: [{ type: "text", text: "Error: " + error }],
        timestamp: Date.now(),
      },
    ];
    return null;
  } finally {
    state.chatSending = false;
  }
}

export async function abortChatRun(state: ChatState): Promise<boolean> {
  if (!state.client || !state.connected) {
    // Connection is down — queue the abort intent for retry after reconnect.
    markAbortPending(state.sessionKey);
    return false;
  }
  const runId = state.chatRunId;
  try {
    await state.client.request(
      "chat.abort",
      runId ? { sessionKey: state.sessionKey, runId } : { sessionKey: state.sessionKey },
    );
    clearAbortPending(state.sessionKey);
    return true;
  } catch (err) {
    state.lastError = String(err);
    // RPC failed (e.g. WS dropped mid-request) — queue for retry.
    markAbortPending(state.sessionKey);
    return false;
  }
}

export function handleChatEvent(state: ChatState, payload?: ChatEventPayload) {
  if (!payload) {
    return null;
  }
  if (!sessionKeysMatch(payload.sessionKey, state.sessionKey)) {
    return null;
  }

  // Final from another run (e.g. sub-agent announce): refresh history to show new message.
  // See https://github.com/openclaw/openclaw/issues/1909
  if (payload.runId && state.chatRunId && payload.runId !== state.chatRunId) {
    if (payload.state === "final") {
      return "final";
    }
    return null;
  }

  if (payload.state === "delta") {
    // Adopt the runId from incoming deltas when chatRunId is null (e.g. after
    // page reload / reconnect). This makes the stop button appear instantly
    // as soon as the first streaming chunk arrives, rather than waiting for
    // the slower queryChatStatus round-trip.
    if (!state.chatRunId && payload.runId) {
      state.chatRunId = payload.runId;
      if (!state.chatStreamStartedAt) {
        state.chatStreamStartedAt = Date.now();
      }
    }
    const raw = extractRawText(payload.message);
    const separated = raw != null ? separateThinkingFromText(raw) : null;
    const next = separated ? separated.cleanText : extractText(payload.message);
    if (typeof next === "string") {
      const current = state.chatStream ?? "";
      if (!current || next.length >= current.length) {
        state.chatStream = next;
      }
    }
    const nextReasoning = separated?.reasoning
      ? normalizeReasoningText(separated.reasoning)
      : undefined;
    if (nextReasoning) {
      const currentReasoning = state.chatStreamReasoning ?? "";
      if (!currentReasoning || nextReasoning.length >= currentReasoning.length) {
        state.chatStreamReasoning = nextReasoning;
      }
    }
  } else if (payload.state === "final") {
    // Append the final message text to chatMessages immediately so there's
    // no visual gap between clearing chatStream and loadChatHistory completing.
    const finalText = extractText(payload.message);
    if (typeof finalText === "string" && finalText.trim()) {
      const finalMsg = {
        role: "assistant",
        messageId: payload.runId ? `client:${payload.runId}:assistant` : undefined,
        content: [{ type: "text", text: finalText }],
        timestamp: Date.now(),
        _streamFinal: true, // marker so loadChatHistory can replace it
      };
      state.chatMessages = [...state.chatMessages, finalMsg];
    }
    state.chatStream = null;
    state.chatStreamReasoning = null;
    state.chatRunId = null;
    state.chatStreamStartedAt = null;
    clearAbortPending(state.sessionKey);
  } else if (payload.state === "aborted") {
    state.chatStream = null;
    state.chatStreamReasoning = null;
    state.chatRunId = null;
    state.chatStreamStartedAt = null;
    clearAbortPending(state.sessionKey);
  } else if (payload.state === "error") {
    state.chatStream = null;
    state.chatStreamReasoning = null;
    state.chatRunId = null;
    state.chatStreamStartedAt = null;
    state.lastError = payload.errorMessage ?? "chat error";
    clearAbortPending(state.sessionKey);
  }
  return payload.state;
}

/**
 * Thread-scoped variant of handleChatEvent.
 * Operates on a ThreadState instead of the host, so it works for
 * visible-but-not-focused panes without the sessionKey guard.
 */
export function handleChatEventForThread(
  thread: ThreadState,
  payload: ChatEventPayload,
): string | null {
  // Sub-agent final from a different run: signal history reload
  if (payload.runId && thread.chatRunId && payload.runId !== thread.chatRunId) {
    if (payload.state === "final") {
      return "final";
    }
    return null;
  }

  if (payload.state === "delta") {
    // Adopt runId from incoming deltas when chatRunId is null (reconnect).
    if (!thread.chatRunId && payload.runId) {
      thread.chatRunId = payload.runId;
      if (!thread.chatStreamStartedAt) {
        thread.chatStreamStartedAt = Date.now();
      }
    }
    const raw = extractRawText(payload.message);
    const separated = raw != null ? separateThinkingFromText(raw) : null;
    const next = separated ? separated.cleanText : extractText(payload.message);
    if (typeof next === "string") {
      const current = thread.chatStream ?? "";
      if (!current || next.length >= current.length) {
        thread.chatStream = next;
      }
    }
    const nextReasoning = separated?.reasoning
      ? normalizeReasoningText(separated.reasoning)
      : undefined;
    if (nextReasoning) {
      const currentReasoning = thread.chatStreamReasoning ?? "";
      if (!currentReasoning || nextReasoning.length >= currentReasoning.length) {
        thread.chatStreamReasoning = nextReasoning;
      }
    }
  } else if (payload.state === "final") {
    // Append final message to avoid visual gap before history reload
    const finalText = extractText(payload.message);
    if (typeof finalText === "string" && finalText.trim()) {
      const finalMsg = {
        role: "assistant",
        messageId: payload.runId ? `client:${payload.runId}:assistant` : undefined,
        content: [{ type: "text", text: finalText }],
        timestamp: Date.now(),
        _streamFinal: true,
      };
      thread.chatMessages = [...(thread.chatMessages as unknown[]), finalMsg];
    }
    thread.chatStream = null;
    thread.chatStreamReasoning = null;
    thread.chatRunId = null;
    thread.chatStreamStartedAt = null;
  } else if (payload.state === "aborted") {
    thread.chatStream = null;
    thread.chatStreamReasoning = null;
    thread.chatRunId = null;
    thread.chatStreamStartedAt = null;
  } else if (payload.state === "error") {
    thread.chatStream = null;
    thread.chatStreamReasoning = null;
    thread.chatRunId = null;
    thread.chatStreamStartedAt = null;
  }
  return payload.state;
}
