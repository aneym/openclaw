import type { OpenClawApp } from "./app";
import type { GatewayHelloOk } from "./gateway";
import type { ChatAttachment, ChatQueueItem } from "./ui-types";
import { parseAgentSessionKey } from "../../../src/sessions/session-key-utils.js";
import { scheduleChatScroll, schedulePaneChatScroll } from "./app-scroll";
import { setLastActiveSessionKey } from "./app-settings";
import { resetToolStream } from "./app-tool-stream";
import { abortChatRun, loadChatHistory, markAbortPending, sendChatMessage } from "./controllers/chat";
import { loadSessions } from "./controllers/sessions";
import { clearDraft, clearAttachments, saveQueue } from "./draft-storage";
import { normalizeBasePath } from "./navigation";
import { generateUUID } from "./uuid";

type ChatHost = {
  connected: boolean;
  chatMessage: string;
  chatAttachments: ChatAttachment[];
  chatQueue: ChatQueueItem[];
  chatRunId: string | null;
  chatSending: boolean;
  sessionKey: string;
  basePath: string;
  hello: GatewayHelloOk | null;
  chatAvatarUrl: string | null;
  refreshSessionsAfterChat: Set<string>;
  splitLayout: unknown | null;
  focusedPaneId: string | null;
};

/** Schedule a chat scroll, scoping to the focused pane in split-pane mode. */
function scrollChat(host: ChatHost, force: boolean) {
  if (host.splitLayout && host.focusedPaneId) {
    schedulePaneChatScroll(
      host as unknown as Parameters<typeof schedulePaneChatScroll>[0],
      host.focusedPaneId,
      force,
    );
  } else {
    scheduleChatScroll(host as unknown as Parameters<typeof scheduleChatScroll>[0], force);
  }
}

export const CHAT_SESSIONS_ACTIVE_MINUTES = 0; // 0 = no filter, fetch all sessions

export function isChatBusy(host: ChatHost) {
  return host.chatSending || Boolean(host.chatRunId);
}

export function isChatStopCommand(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  const normalized = trimmed.toLowerCase();
  if (normalized === "/stop") {
    return true;
  }
  return (
    normalized === "stop" ||
    normalized === "esc" ||
    normalized === "abort" ||
    normalized === "wait" ||
    normalized === "exit"
  );
}

function isChatResetCommand(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  const normalized = trimmed.toLowerCase();
  if (normalized === "/new" || normalized === "/reset") {
    return true;
  }
  return normalized.startsWith("/new ") || normalized.startsWith("/reset ");
}

export async function handleAbortChat(host: ChatHost) {
  host.chatMessage = "";
  if (!host.connected) {
    // Connection is down — queue the abort for retry after reconnect.
    markAbortPending(host.sessionKey);
    return;
  }
  await abortChatRun(host as unknown as OpenClawApp);
}

function enqueueChatMessage(
  host: ChatHost,
  text: string,
  attachments?: ChatAttachment[],
  refreshSessions?: boolean,
) {
  const trimmed = text.trim();
  const hasAttachments = Boolean(attachments && attachments.length > 0);
  if (!trimmed && !hasAttachments) {
    return;
  }
  host.chatQueue = [
    ...host.chatQueue,
    {
      id: generateUUID(),
      text: trimmed,
      createdAt: Date.now(),
      attachments: hasAttachments ? attachments?.map((att) => ({ ...att })) : undefined,
      refreshSessions,
    },
  ];
  saveQueue(host.sessionKey, host.chatQueue);
}

async function sendChatMessageNow(
  host: ChatHost,
  message: string,
  opts?: {
    previousDraft?: string;
    restoreDraft?: boolean;
    attachments?: ChatAttachment[];
    previousAttachments?: ChatAttachment[];
    restoreAttachments?: boolean;
    refreshSessions?: boolean;
  },
) {
  resetToolStream(host as unknown as Parameters<typeof resetToolStream>[0]);
  const runId = await sendChatMessage(host as unknown as OpenClawApp, message, opts?.attachments);
  const ok = Boolean(runId);
  if (!ok && opts?.previousDraft != null) {
    host.chatMessage = opts.previousDraft;
  }
  if (!ok && opts?.previousAttachments) {
    host.chatAttachments = opts.previousAttachments;
  }
  if (ok) {
    setLastActiveSessionKey(
      host as unknown as Parameters<typeof setLastActiveSessionKey>[0],
      host.sessionKey,
    );
  }
  if (ok && opts?.restoreDraft && opts.previousDraft?.trim()) {
    host.chatMessage = opts.previousDraft;
  }
  if (ok && opts?.restoreAttachments && opts.previousAttachments?.length) {
    host.chatAttachments = opts.previousAttachments;
  }
  scrollChat(host, true);
  if (ok && !host.chatRunId) {
    void flushChatQueue(host);
  }
  if (ok && opts?.refreshSessions && runId) {
    host.refreshSessionsAfterChat.add(runId);
  }
  return ok;
}

async function flushChatQueue(host: ChatHost) {
  if (!host.connected || isChatBusy(host)) {
    return;
  }
  const [next, ...rest] = host.chatQueue;
  if (!next) {
    return;
  }
  host.chatQueue = rest;
  saveQueue(host.sessionKey, host.chatQueue);
  const ok = await sendChatMessageNow(host, next.text, {
    attachments: next.attachments,
    refreshSessions: next.refreshSessions,
  });
  if (!ok) {
    host.chatQueue = [next, ...host.chatQueue];
    saveQueue(host.sessionKey, host.chatQueue);
  }
}

export function removeQueuedMessage(host: ChatHost, id: string) {
  host.chatQueue = host.chatQueue.filter((item) => item.id !== id);
  saveQueue(host.sessionKey, host.chatQueue);
}

export function clearAllQueuedMessages(host: ChatHost) {
  host.chatQueue = [];
  saveQueue(host.sessionKey, host.chatQueue);
}

/**
 * Poll until `host.chatRunId` clears (abort completed) or timeout.
 * Returns true if abort completed, false on timeout.
 */
export async function waitForAbortComplete(
  host: ChatHost,
  timeoutMs = 5000,
): Promise<boolean> {
  if (!host.chatRunId) return true;
  const start = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      if (!host.chatRunId) {
        resolve(true);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(check, 50);
    };
    check();
  });
}

/**
 * Abort current run, wait for it to clear, then send a message immediately.
 */
export async function sendChatImmediately(
  host: ChatHost,
  message: string,
  attachments?: ChatAttachment[],
) {
  await abortChatRun(host as unknown as OpenClawApp);
  const cleared = await waitForAbortComplete(host);
  if (!cleared) {
    // Timeout — enqueue as fallback so the message isn't lost
    enqueueChatMessage(host, message, attachments);
    return;
  }
  // Reload history so the aborted partial response is visible
  await loadChatHistory(host as unknown as OpenClawApp);
  await sendChatMessageNow(host, message, {
    attachments: attachments?.length ? attachments : undefined,
  });
}

/**
 * Pull a specific queued message out and send it immediately (abort first).
 */
export async function sendQueuedMessageNow(host: ChatHost, id: string) {
  const item = host.chatQueue.find((q) => q.id === id);
  if (!item) return;
  host.chatQueue = host.chatQueue.filter((q) => q.id !== id);
  saveQueue(host.sessionKey, host.chatQueue);
  await sendChatImmediately(host, item.text, item.attachments);
}

export async function handleSendChat(
  host: ChatHost,
  messageOverride?: string,
  opts?: { restoreDraft?: boolean; sendImmediately?: boolean },
) {
  if (!host.connected) {
    return;
  }
  const previousDraft = host.chatMessage;
  const message = (messageOverride ?? host.chatMessage).trim();
  const attachments = host.chatAttachments ?? [];
  const attachmentsToSend = messageOverride == null ? attachments : [];
  const hasAttachments = attachmentsToSend.length > 0;

  // Allow sending with just attachments (no message text required)
  if (!message && !hasAttachments) {
    return;
  }

  if (isChatStopCommand(message)) {
    await handleAbortChat(host);
    return;
  }

  const refreshSessions = isChatResetCommand(message);
  if (messageOverride == null) {
    host.chatMessage = "";
    // Clear attachments when sending
    host.chatAttachments = [];
    clearDraft(host.sessionKey);
    clearAttachments(host.sessionKey);
  }

  // Scroll to bottom immediately so the user sees their message
  scrollChat(host, true);

  if (isChatBusy(host)) {
    if (opts?.sendImmediately) {
      await sendChatImmediately(host, message, attachmentsToSend);
      return;
    }
    enqueueChatMessage(host, message, attachmentsToSend, refreshSessions);
    return;
  }

  await sendChatMessageNow(host, message, {
    previousDraft: messageOverride == null ? previousDraft : undefined,
    restoreDraft: Boolean(messageOverride && opts?.restoreDraft),
    attachments: hasAttachments ? attachmentsToSend : undefined,
    previousAttachments: messageOverride == null ? attachments : undefined,
    restoreAttachments: Boolean(messageOverride && opts?.restoreDraft),
    refreshSessions,
  });
}

export async function refreshChat(host: ChatHost) {
  await Promise.all([
    loadChatHistory(host as unknown as OpenClawApp),
    loadSessions(host as unknown as OpenClawApp, {
      activeMinutes: CHAT_SESSIONS_ACTIVE_MINUTES,
    }),
    refreshChatAvatar(host),
  ]);
  scheduleChatScroll(host as unknown as Parameters<typeof scheduleChatScroll>[0]);
}

export const flushChatQueueForEvent = flushChatQueue;

type SessionDefaultsSnapshot = {
  defaultAgentId?: string;
};

function resolveAgentIdForSession(host: ChatHost): string | null {
  const parsed = parseAgentSessionKey(host.sessionKey);
  if (parsed?.agentId) {
    return parsed.agentId;
  }
  const snapshot = host.hello?.snapshot as
    | { sessionDefaults?: SessionDefaultsSnapshot }
    | undefined;
  const fallback = snapshot?.sessionDefaults?.defaultAgentId?.trim();
  return fallback || "main";
}

function buildAvatarMetaUrl(basePath: string, agentId: string): string {
  const base = normalizeBasePath(basePath);
  const encoded = encodeURIComponent(agentId);
  return base ? `${base}/avatar/${encoded}?meta=1` : `/avatar/${encoded}?meta=1`;
}

export async function refreshChatAvatar(host: ChatHost) {
  if (!host.connected) {
    host.chatAvatarUrl = null;
    return;
  }
  const agentId = resolveAgentIdForSession(host);
  if (!agentId) {
    host.chatAvatarUrl = null;
    return;
  }
  host.chatAvatarUrl = null;
  const url = buildAvatarMetaUrl(host.basePath, agentId);
  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      host.chatAvatarUrl = null;
      return;
    }
    const data = (await res.json()) as { avatarUrl?: unknown };
    const avatarUrl = typeof data.avatarUrl === "string" ? data.avatarUrl.trim() : "";
    host.chatAvatarUrl = avatarUrl || null;
  } catch {
    host.chatAvatarUrl = null;
  }
}
