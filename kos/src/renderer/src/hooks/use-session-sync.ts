import { useCallback, useEffect, useRef } from "react";
import type { Thread, ThreadStatus } from "../types";
import { useGatewayStore } from "../stores/gateway-store";
import { useThreadStore } from "../stores/thread-store";
import { useWorkspaceStore } from "../stores/workspace-store";

type SessionRecord = Record<string, unknown>;

const HOME_TAB_PREFIX = "home-";

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

const resolveSessionProjectId = (session: SessionRecord): string | undefined => {
  const direct = readString(session.projectId);
  if (direct) return direct;
  if (isRecord(session.project)) {
    return readString(session.project.id);
  }
  return undefined;
};

const resolveSessionWorkspaceId = (session: SessionRecord): string | undefined => {
  const direct = readString(session.workspaceId);
  if (direct) return direct;
  if (isRecord(session.metadata)) {
    return readString(session.metadata.workspaceId);
  }
  return undefined;
};

const resolveSessionTabId = (session: SessionRecord): string | undefined => {
  const direct = readString(session.tabId);
  if (direct) return direct;
  if (isRecord(session.tab)) {
    return readString(session.tab.id) ?? readString(session.tab.tabId);
  }
  if (isRecord(session.metadata)) {
    return readString(session.metadata.tabId);
  }
  return undefined;
};

const resolveSessionStatus = (session: SessionRecord): ThreadStatus | undefined => {
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

const generateThreadId = () => `thread-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const findThreadBySessionKey = (
  threads: Map<string, Thread>,
  sessionKey: string,
): Thread | undefined => {
  for (const thread of threads.values()) {
    if (thread.sessionKey === sessionKey) return thread;
  }
  return undefined;
};

const resolveHomeTabId = (workspaceId?: string | null): string | undefined =>
  workspaceId ? `${HOME_TAB_PREFIX}${workspaceId}` : undefined;

export function useSessionSync() {
  const subscribe = useGatewayStore((s) => s.subscribe);
  const request = useGatewayStore((s) => s.request);
  const connected = useGatewayStore((s) => s.connected);
  const addThread = useThreadStore((s) => s.addThread);
  const updateThread = useThreadStore((s) => s.updateThread);
  const archiveThread = useThreadStore((s) => s.archiveThread);
  const setLoading = useThreadStore((s) => s.setLoading);
  const threads = useThreadStore((s) => s.threads);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);

  const threadsRef = useRef(threads);
  const workspaceIdRef = useRef(activeWorkspaceId);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  useEffect(() => {
    workspaceIdRef.current = activeWorkspaceId;
  }, [activeWorkspaceId]);

  const upsertThreadFromSession = useCallback(
    (payload: unknown, overrides?: { status?: ThreadStatus; lastMessageAt?: number }) => {
      const sessionKey = resolveSessionKey(payload);
      if (!sessionKey) return;

      const session = resolveSessionRecord(payload) ?? {};
      const existing = findThreadBySessionKey(threadsRef.current, sessionKey);
      const { title, isExplicit } = resolveSessionTitle(session);
      const resolvedStatus = overrides?.status ?? resolveSessionStatus(session);
      const resolvedProjectId = resolveSessionProjectId(session);
      const workspaceId = resolveSessionWorkspaceId(session) ?? workspaceIdRef.current ?? "default";
      const resolvedTabId = resolveSessionTabId(session) ?? resolveHomeTabId(workspaceId);
      const lastMessageAt = overrides?.lastMessageAt ?? resolveSessionLastMessageAt(session);

      if (existing) {
        if (resolvedStatus === "archived") {
          archiveThread(existing.id);
          return;
        }

        const patch: Partial<Thread> = {};

        if (isExplicit && title !== existing.title) {
          patch.title = title;
        }

        if (typeof lastMessageAt === "number" && lastMessageAt > existing.lastMessageAt) {
          patch.lastMessageAt = lastMessageAt;
        }

        if (resolvedStatus && resolvedStatus !== existing.status) {
          patch.status = resolvedStatus;
        }

        if (resolvedProjectId && resolvedProjectId !== existing.projectId) {
          patch.projectId = resolvedProjectId;
        }

        if (resolvedTabId && resolvedTabId !== existing.tabId) {
          patch.tabId = resolvedTabId;
        }

        if (Object.keys(patch).length > 0) {
          updateThread(existing.id, patch);
        }

        return;
      }

      const now = Date.now();
      const createdAt = resolveSessionCreatedAt(session) ?? now;
      const initialLastMessageAt = typeof lastMessageAt === "number" ? lastMessageAt : createdAt;

      const newThread: Thread = {
        id: generateThreadId(),
        sessionKey,
        title,
        status: resolvedStatus ?? "idle",
        lastMessageAt: initialLastMessageAt,
        createdAt,
        projectId: resolvedProjectId,
        tabId: resolvedTabId ?? resolveHomeTabId(workspaceId) ?? `home-${workspaceId}`,
      };

      addThread(newThread);
    },
    [addThread, archiveThread, updateThread],
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
          upsertThreadFromSession(entry);
        }

        if (list.shouldArchive) {
          for (const thread of threadsRef.current.values()) {
            if (!seen.has(thread.sessionKey)) {
              archiveThread(thread.id);
            }
          }
        }
      }),
      subscribe("session.created", (payload) => {
        upsertThreadFromSession(payload);
      }),
      subscribe("session.updated", (payload) => {
        upsertThreadFromSession(payload);
      }),
      subscribe("session.message", (payload) => {
        if (!isRecord(payload)) return;
        const ts = resolveMessageTimestamp(payload) ?? Date.now();
        upsertThreadFromSession(payload, { lastMessageAt: ts });
      }),
      subscribe("session.stream.start", (payload) => {
        upsertThreadFromSession(payload, { status: "active" });
      }),
      subscribe("session.stream.end", (payload) => {
        upsertThreadFromSession(payload, { status: "idle" });
      }),
    ];

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [subscribe, archiveThread, upsertThreadFromSession, setLoading]);

  useEffect(() => {
    if (!connected) {
      return;
    }

    setLoading(true);
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
          upsertThreadFromSession(entry);
        }
        for (const thread of threadsRef.current.values()) {
          if (!seen.has(thread.sessionKey)) {
            archiveThread(thread.id);
          }
        }
      })
      .catch((err) => {
        console.warn("[useSessionSync] sessions.list failed:", err);
      })
      .finally(() => {
        setLoading(false);
      });

    return () => {
      cancelled = true;
      setLoading(false);
    };
  }, [connected, request, archiveThread, upsertThreadFromSession, setLoading]);
}
