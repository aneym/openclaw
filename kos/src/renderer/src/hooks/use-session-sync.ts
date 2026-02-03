import { useCallback, useEffect, useRef } from "react";
import type { Chat, ChatStatus } from "../types";
import { useChatStore } from "../stores/chat-store";
import { useGatewayStore } from "../stores/gateway-store";
import { useProjectStore } from "../stores/project-store";
import { useWorkspaceStore } from "../stores/workspace-store";

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

  // Get active workspace
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const activeWorkspaceByProject = useWorkspaceStore((s) => s.activeWorkspaceByProject);

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

        if (Object.keys(patch).length > 0) {
          updateChat(existing.id, patch);
        }

        return;
      }

      const now = Date.now();
      const createdAt = resolveSessionCreatedAt(session) ?? now;
      const initialLastMessageAt = typeof lastMessageAt === "number" ? lastMessageAt : createdAt;

      const newChat: Chat = {
        id: generateChatId(),
        workspaceId,
        sessionKey,
        title,
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

  useEffect(() => {
    if (!connected) {
      return;
    }

    let cancelled = false;
    request<{ sessions?: unknown[] }>("sessions.list", {
      limit: 200,
      includeDerivedTitles: true,
      includeLastMessage: true,
    })
      .then((result) => {
        if (cancelled) return;
        const sessions = Array.isArray(result?.sessions) ? result.sessions : [];
        if (sessions.length === 0) return;
        const seen = new Set<string>();
        for (const entry of sessions) {
          const sessionKey = resolveSessionKey(entry);
          if (!sessionKey) continue;
          seen.add(sessionKey);
          upsertChatFromSession(entry);
        }
        for (const chat of chatsRef.current.values()) {
          if (!seen.has(chat.sessionKey)) {
            archiveChat(chat.id);
          }
        }
      })
      .catch((err) => {
        console.warn("[useSessionSync] sessions.list failed:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [connected, request, archiveChat, upsertChatFromSession]);
}
