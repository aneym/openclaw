import { useCallback, useEffect, useRef, useState } from "react";
import type { Chat, ChatStatus } from "../types";
import { useChatStore } from "../stores/chat-store";
import { useGatewayStore } from "../stores/gateway-store";
import { useProjectStore } from "../stores/project-store";
import { useWorkspaceStore } from "../stores/workspace-store";

// Tiered loading configuration
const INITIAL_LOAD_LIMIT = 50;
const INITIAL_ACTIVE_MINUTES = 10080; // 7 days
const FULL_LOAD_LIMIT = 500;

type SessionRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is SessionRecord =>
  typeof value === "object" && value !== null;

const readString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const readTimestamp = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
};

const resolveSessionRecord = (payload: unknown): SessionRecord | null => {
  if (!isRecord(payload)) return null;
  if (isRecord(payload.session)) return payload.session;
  if (isRecord(payload.entry)) return payload.entry;
  if (isRecord(payload.data)) return payload.data;
  return payload;
};

const resolveSessionKey = (payload: unknown): string | null => {
  if (!isRecord(payload)) return null;
  const direct =
    readString(payload.sessionKey) ?? readString(payload.key) ?? readString(payload.id);
  if (direct) return direct;
  if (isRecord(payload.session)) return resolveSessionKey(payload.session);
  return null;
};

const resolveSessionTitle = (session: SessionRecord): { title: string; isExplicit: boolean } => {
  const origin = isRecord(session.origin) ? session.origin : null;
  const candidates = [
    readString(session.title),
    readString(session.displayName),
    readString(session.derivedTitle),
    readString(session.label),
    origin ? readString(origin.label) : undefined,
    readString(session.subject),
  ].filter(Boolean) as string[];

  if (candidates.length > 0) {
    return { title: candidates[0], isExplicit: true };
  }

  return { title: "New Chat", isExplicit: false };
};

const resolveSessionStatus = (session: SessionRecord): ChatStatus | undefined => {
  const status = readString(session.status);
  if (status === "active" || status === "idle" || status === "archived") {
    return status;
  }
  if (readTimestamp(session.archivedAt)) {
    return "archived";
  }
  return undefined;
};

const resolveSessionLastMessageAt = (session: SessionRecord): number | undefined =>
  readTimestamp(session.lastMessageAt) ??
  readTimestamp(session.lastMessageTs) ??
  readTimestamp(session.updatedAt) ??
  readTimestamp(session.ts) ??
  readTimestamp(session.createdAt);

const resolveSessionCreatedAt = (session: SessionRecord): number | undefined =>
  readTimestamp(session.createdAt) ?? readTimestamp(session.updatedAt);

const resolveSessionChannel = (session: SessionRecord): string | undefined => {
  // Try direct channel field first
  const direct = readString(session.channel);
  if (direct) return direct;

  // Try extracting from session origin
  if (isRecord(session.origin)) {
    const provider = readString(session.origin.provider);
    if (provider) return provider;
  }

  // Try extracting from lastChannel field
  const lastChannel = readString(session.lastChannel);
  if (lastChannel && lastChannel !== "webchat") return lastChannel;

  // Try extracting from session key format: agent:{agentId}:{channel}:...
  const sessionKey = readString(session.sessionId) ?? readString(session.key);
  if (sessionKey) {
    const parts = sessionKey.toLowerCase().split(":");
    // Format: agent:main:slack:... or slack:g-...
    if (parts[0] === "agent" && parts.length >= 3) {
      const potentialChannel = parts[2];
      if (potentialChannel && potentialChannel !== "dm" && potentialChannel !== "subagent") {
        return potentialChannel;
      }
    } else if (parts.length >= 2) {
      // Format: slack:g-... or telegram:c-...
      const potentialChannel = parts[0];
      const knownChannels = ["slack", "telegram", "discord", "whatsapp", "signal", "imessage"];
      if (knownChannels.includes(potentialChannel)) {
        return potentialChannel;
      }
    }
  }

  return undefined;
};

const resolveMessageTimestamp = (payload: SessionRecord): number | undefined => {
  const direct =
    readTimestamp(payload.timestamp) ??
    readTimestamp(payload.ts) ??
    readTimestamp(payload.createdAt);
  if (direct) return direct;
  if (isRecord(payload.message)) {
    return (
      readTimestamp(payload.message.timestamp) ??
      readTimestamp(payload.message.createdAt) ??
      readTimestamp(payload.message.ts)
    );
  }
  return undefined;
};

const parseSessionListPayload = (
  payload: unknown,
): { sessions: unknown[]; shouldArchive: boolean } | null => {
  if (Array.isArray(payload)) {
    return { sessions: payload, shouldArchive: true };
  }
  if (isRecord(payload) && Array.isArray(payload.sessions)) {
    return { sessions: payload.sessions, shouldArchive: true };
  }
  return null;
};

const generateChatId = () => `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

/**
 * Load more chats from the gateway.
 * Can be called from any component to load older sessions.
 * Uses stores directly so it doesn't require a hook context.
 */
export async function loadMoreChats(): Promise<void> {
  const { request, connected } = useGatewayStore.getState();
  const { hasMore, isLoadingMore, setHasMore, setLoadingMore, archiveChat, chats } =
    useChatStore.getState();

  if (!connected || isLoadingMore || !hasMore) {
    return;
  }

  setLoadingMore(true);

  try {
    const result = await request<{ sessions?: unknown[] }>("sessions.list", {
      limit: FULL_LOAD_LIMIT,
      includeDerivedTitles: true,
    });

    const sessions = Array.isArray(result?.sessions) ? result.sessions : [];
    const seen = new Set<string>();

    for (const entry of sessions) {
      const sessionKey = resolveSessionKey(entry);
      if (!sessionKey) continue;
      seen.add(sessionKey);
      // Use store's addChat/updateChat directly
      upsertChatFromSessionStandalone(entry);
    }

    // Archive chats not in the full list
    for (const chat of chats.values()) {
      if (!seen.has(chat.sessionKey) && chat.status !== "archived") {
        archiveChat(chat.id);
      }
    }

    setHasMore(false);
  } catch (err) {
    console.warn("[loadMoreChats] sessions.list failed:", err);
  } finally {
    setLoadingMore(false);
  }
}

/**
 * Standalone version of upsertChatFromSession that doesn't use hooks.
 * Used by loadMoreChats to process sessions outside of React lifecycle.
 */
function upsertChatFromSessionStandalone(payload: unknown): void {
  const sessionKey = resolveSessionKey(payload);
  if (!sessionKey) return;

  const session = resolveSessionRecord(payload) ?? {};
  const { chats, addChat, updateChat, archiveChat } = useChatStore.getState();
  const existing = findChatBySessionKey(chats, sessionKey);
  const { title, isExplicit } = resolveSessionTitle(session);
  const resolvedStatus = resolveSessionStatus(session);
  const lastMessageAt = resolveSessionLastMessageAt(session);

  if (existing) {
    if (resolvedStatus === "archived") {
      archiveChat(existing.id);
      return;
    }

    const patch: Partial<Chat> = {};

    if (isExplicit && title !== existing.title) {
      patch.title = title;
    }

    if (typeof lastMessageAt === "number" && lastMessageAt > existing.lastMessageAt) {
      patch.lastMessageAt = lastMessageAt;
    }

    if (resolvedStatus && resolvedStatus !== existing.status) {
      patch.status = resolvedStatus;
    }

    // Update channel if present and different
    const channel = resolveSessionChannel(session);
    if (channel && channel !== existing.channel) {
      patch.channel = channel;
    }

    if (Object.keys(patch).length > 0) {
      updateChat(existing.id, patch);
    }

    return;
  }

  const now = Date.now();
  const createdAt = resolveSessionCreatedAt(session) ?? now;
  const initialLastMessageAt = typeof lastMessageAt === "number" ? lastMessageAt : createdAt;
  const channel = resolveSessionChannel(session);

  const newChat: Chat = {
    id: generateChatId(),
    workspaceId: "default", // loadMore doesn't have workspace context
    sessionKey,
    title,
    channel,
    status: resolvedStatus ?? "idle",
    lastMessageAt: initialLastMessageAt,
    createdAt,
  };

  addChat(newChat);
}

const findChatBySessionKey = (chats: Map<string, Chat>, sessionKey: string): Chat | undefined => {
  for (const chat of chats.values()) {
    if (chat.sessionKey === sessionKey) return chat;
  }
  return undefined;
};

export function useSessionSync() {
  const subscribe = useGatewayStore((s) => s.subscribe);
  const request = useGatewayStore((s) => s.request);
  const connected = useGatewayStore((s) => s.connected);

  // Chat store
  const addChat = useChatStore((s) => s.addChat);
  const updateChat = useChatStore((s) => s.updateChat);
  const archiveChat = useChatStore((s) => s.archiveChat);
  const chats = useChatStore((s) => s.chats);
  const setHasMore = useChatStore((s) => s.setHasMore);
  const setLoadingMore = useChatStore((s) => s.setLoadingMore);
  const hasMore = useChatStore((s) => s.hasMore);
  const isLoadingMore = useChatStore((s) => s.isLoadingMore);

  // Get active workspace
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const activeWorkspaceByProject = useWorkspaceStore((s) => s.activeWorkspaceByProject);

  // Track if we've completed initial load
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  const chatsRef = useRef(chats);
  const activeProjectIdRef = useRef(activeProjectId);

  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);

  const getActiveWorkspaceId = useCallback(() => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) return "default";
    return activeWorkspaceByProject.get(projectId) ?? "default";
  }, [activeWorkspaceByProject]);

  const upsertChatFromSession = useCallback(
    (payload: unknown, overrides?: { status?: ChatStatus; lastMessageAt?: number }) => {
      const sessionKey = resolveSessionKey(payload);
      if (!sessionKey) return;

      const session = resolveSessionRecord(payload) ?? {};
      const existing = findChatBySessionKey(chatsRef.current, sessionKey);
      const { title, isExplicit } = resolveSessionTitle(session);
      const resolvedStatus = overrides?.status ?? resolveSessionStatus(session);
      const workspaceId = getActiveWorkspaceId();
      const lastMessageAt = overrides?.lastMessageAt ?? resolveSessionLastMessageAt(session);

      if (existing) {
        if (resolvedStatus === "archived") {
          archiveChat(existing.id);
          return;
        }

        const patch: Partial<Chat> = {};

        if (isExplicit && title !== existing.title) {
          patch.title = title;
        }

        if (typeof lastMessageAt === "number" && lastMessageAt > existing.lastMessageAt) {
          patch.lastMessageAt = lastMessageAt;
        }

        if (resolvedStatus && resolvedStatus !== existing.status) {
          patch.status = resolvedStatus;
        }

        // Update channel if present and different
        const channel = resolveSessionChannel(session);
        if (channel && channel !== existing.channel) {
          patch.channel = channel;
        }

        if (Object.keys(patch).length > 0) {
          updateChat(existing.id, patch);
        }

        return;
      }

      const now = Date.now();
      const createdAt = resolveSessionCreatedAt(session) ?? now;
      const initialLastMessageAt = typeof lastMessageAt === "number" ? lastMessageAt : createdAt;
      const channel = resolveSessionChannel(session);

      const newChat: Chat = {
        id: generateChatId(),
        workspaceId,
        sessionKey,
        title,
        channel,
        status: resolvedStatus ?? "idle",
        lastMessageAt: initialLastMessageAt,
        createdAt,
      };

      addChat(newChat);
    },
    [addChat, archiveChat, updateChat, getActiveWorkspaceId],
  );

  useEffect(() => {
    const unsubscribes = [
      subscribe("session.list", (payload) => {
        const list = parseSessionListPayload(payload);
        if (!list) return;

        const seen = new Set<string>();
        for (const entry of list.sessions) {
          const sessionKey = resolveSessionKey(entry);
          if (!sessionKey) continue;
          seen.add(sessionKey);
          upsertChatFromSession(entry);
        }

        if (list.shouldArchive) {
          for (const chat of chatsRef.current.values()) {
            if (!seen.has(chat.sessionKey)) {
              archiveChat(chat.id);
            }
          }
        }
      }),
      subscribe("session.created", (payload) => {
        upsertChatFromSession(payload);
      }),
      subscribe("session.updated", (payload) => {
        upsertChatFromSession(payload);
      }),
      subscribe("session.message", (payload) => {
        if (!isRecord(payload)) return;
        const ts = resolveMessageTimestamp(payload) ?? Date.now();
        upsertChatFromSession(payload, { lastMessageAt: ts });
      }),
      subscribe("session.stream.start", (payload) => {
        upsertChatFromSession(payload, { status: "active" });
      }),
      subscribe("session.stream.end", (payload) => {
        upsertChatFromSession(payload, { status: "idle" });
      }),
    ];

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [subscribe, archiveChat, upsertChatFromSession]);

  // Initial load: fetch recent sessions only (7 days, up to 50)
  useEffect(() => {
    if (!connected) {
      return;
    }

    let cancelled = false;
    request<{ sessions?: unknown[] }>("sessions.list", {
      limit: INITIAL_LOAD_LIMIT,
      activeMinutes: INITIAL_ACTIVE_MINUTES,
      includeDerivedTitles: true,
      includeLastMessage: true,
    })
      .then((result) => {
        if (cancelled) return;
        const sessions = Array.isArray(result?.sessions) ? result.sessions : [];

        // Process sessions without archiving (partial list)
        for (const entry of sessions) {
          upsertChatFromSession(entry);
        }

        // Set hasMore if we hit the limit (server may have more)
        setHasMore(sessions.length >= INITIAL_LOAD_LIMIT);
        setInitialLoadComplete(true);
      })
      .catch((err) => {
        console.warn("[useSessionSync] sessions.list (initial) failed:", err);
        setInitialLoadComplete(true);
      });

    return () => {
      cancelled = true;
    };
  }, [connected, request, upsertChatFromSession, setHasMore]);

  // Load more: fetch full session list
  const loadMoreChats = useCallback(async () => {
    if (!connected || isLoadingMore || !hasMore) {
      return;
    }

    setLoadingMore(true);

    try {
      const result = await request<{ sessions?: unknown[] }>("sessions.list", {
        limit: FULL_LOAD_LIMIT,
        includeDerivedTitles: true,
      });

      const sessions = Array.isArray(result?.sessions) ? result.sessions : [];

      // Process all sessions
      const seen = new Set<string>();
      for (const entry of sessions) {
        const sessionKey = resolveSessionKey(entry);
        if (!sessionKey) continue;
        seen.add(sessionKey);
        upsertChatFromSession(entry);
      }

      // Archive chats not in the full list
      for (const chat of chatsRef.current.values()) {
        if (!seen.has(chat.sessionKey) && chat.status !== "archived") {
          archiveChat(chat.id);
        }
      }

      // No more to load (we got the full list)
      setHasMore(false);
    } catch (err) {
      console.warn("[useSessionSync] sessions.list (loadMore) failed:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [
    connected,
    isLoadingMore,
    hasMore,
    request,
    upsertChatFromSession,
    archiveChat,
    setHasMore,
    setLoadingMore,
  ]);

  return {
    loadMoreChats,
    hasMore,
    isLoadingMore,
    initialLoadComplete,
  };
}
