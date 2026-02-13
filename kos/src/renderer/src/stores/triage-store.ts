import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TriageEvent, TriageSource } from "../types/triage";

interface TriageState {
  events: TriageEvent[];
  cursor: number; // index into pending list (oldest-first)
  autoAdvance: boolean;
  inputMode: boolean;

  enqueue: (event: Omit<TriageEvent, "id" | "state"> & { id?: string }) => void;
  markHandled: (eventId: string) => void;
  markSkipped: (eventId: string) => void;
  next: () => void;
  prev: () => void;
  setAutoAdvance: (enabled: boolean) => void;
  toggleAutoAdvance: () => void;
  setInputMode: (enabled: boolean) => void;

  clearAll: () => void;
}

function sortOldestFirst(a: TriageEvent, b: TriageEvent) {
  return a.occurredAt - b.occurredAt;
}

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function dedupeKey(
  e: Pick<TriageEvent, "source" | "sourceEventId" | "chatId" | "sessionKey" | "terminalId">,
) {
  // Catch-up/triage is a "focused inbox", not an event log.
  // For gateway chat, we want at most one pending item per thread (chatId/sessionKey),
  // even if multiple completions land while the thread is unread.
  if (e.source === "gateway") {
    const primary = e.chatId ? `chat:${e.chatId}` : e.sessionKey ? `sk:${e.sessionKey}` : "unknown";
    return `${e.source}:${primary}`;
  }

  // For terminal completions, group by terminalId (one pending item per terminal).
  if (e.terminalId) {
    return `${e.source}:term:${e.terminalId}`;
  }

  // Default: prefer sessionKey, then explicit sourceEventId.
  const primary = e.sessionKey
    ? `sk:${e.sessionKey}`
    : e.sourceEventId
      ? `ev:${e.sourceEventId}`
      : "unknown";
  return `${e.source}:${primary}`;
}

function pendingEvents(events: TriageEvent[]): TriageEvent[] {
  return events.filter((e) => e.state === "pending").toSorted(sortOldestFirst);
}

export const useTriageStore = create<TriageState>()(
  persist(
    (set, get) => ({
      events: [],
      cursor: 0,
      autoAdvance: false,
      inputMode: false,

      enqueue: (event) => {
        const next: TriageEvent = {
          id: event.id ?? generateId(`triage-${event.source}`),
          state: "pending",
          ...event,
        };

        set((s) => {
          // Dedupe: if a pending item for the same thread/source exists, keep the latest occurredAt
          // and update preview/title with the newest data.
          const key = dedupeKey(next);
          const idx = s.events.findIndex((e) => e.state === "pending" && dedupeKey(e) === key);
          if (idx !== -1) {
            const existing = s.events[idx];
            const merged: TriageEvent = {
              ...existing,
              occurredAt: Math.max(existing.occurredAt, next.occurredAt),
              title: next.title || existing.title,
              preview: next.preview ?? existing.preview,
              sourceEventId: next.sourceEventId ?? existing.sourceEventId,
              chatId: next.chatId ?? existing.chatId,
              sessionKey: next.sessionKey ?? existing.sessionKey,
              terminalId: next.terminalId ?? existing.terminalId,
            };
            const updated = s.events.slice();
            updated[idx] = merged;
            return { events: updated };
          }
          return { events: [...s.events, next] };
        });

        // Clamp cursor against new pending list.
        set((s) => {
          const pending = pendingEvents(s.events);
          const cursor = pending.length === 0 ? 0 : Math.min(s.cursor, pending.length - 1);
          return cursor !== s.cursor ? { cursor } : s;
        });
      },

      markHandled: (eventId) => {
        set((s) => {
          const idx = s.events.findIndex((e) => e.id === eventId);
          if (idx === -1) {
            return s;
          }
          const updated = s.events.slice();
          updated[idx] = { ...updated[idx], state: "handled" };
          return { events: updated };
        });

        // After handling, keep cursor pointing at the next item (same index in new list).
        set((s) => {
          const pending = pendingEvents(s.events);
          const cursor = pending.length === 0 ? 0 : Math.min(s.cursor, pending.length - 1);
          return cursor !== s.cursor ? { cursor } : s;
        });
      },

      markSkipped: (eventId) => {
        set((s) => {
          const idx = s.events.findIndex((e) => e.id === eventId);
          if (idx === -1) {
            return s;
          }
          const updated = s.events.slice();
          updated[idx] = { ...updated[idx], state: "skipped" };
          return { events: updated };
        });

        set((s) => {
          const pending = pendingEvents(s.events);
          const cursor = pending.length === 0 ? 0 : Math.min(s.cursor, pending.length - 1);
          return cursor !== s.cursor ? { cursor } : s;
        });
      },

      next: () => {
        const pending = pendingEvents(get().events);
        if (pending.length === 0) {
          return;
        }
        set((s) => ({ cursor: Math.min(s.cursor + 1, pending.length - 1) }));
      },

      prev: () => {
        const pending = pendingEvents(get().events);
        if (pending.length === 0) {
          return;
        }
        set((s) => ({ cursor: Math.max(s.cursor - 1, 0) }));
      },

      setAutoAdvance: (enabled) => set({ autoAdvance: enabled }),
      toggleAutoAdvance: () => set((s) => ({ autoAdvance: !s.autoAdvance })),
      setInputMode: (enabled) => set({ inputMode: enabled }),

      clearAll: () => set({ events: [], cursor: 0, inputMode: false }),
    }),
    {
      name: "kos-triage",
      version: 2,
      migrate: (persisted, version) => {
        // v2: catch-up items are per-thread (gateway chatId/sessionKey), not per-completion event.
        if (!persisted || typeof persisted !== "object") {
          return persisted as TriageState;
        }
        if (version >= 2) {
          return persisted as TriageState;
        }

        const state = persisted as TriageState;
        if (!Array.isArray(state.events)) {
          return state;
        }

        const nonPending: TriageEvent[] = [];
        const pendingByKey = new Map<string, TriageEvent>();

        for (const e of state.events) {
          if (!e || typeof e !== "object") {
            continue;
          }
          if (e.state !== "pending") {
            nonPending.push(e);
            continue;
          }

          const key = dedupeKey(e);
          const existing = pendingByKey.get(key);
          if (!existing) {
            pendingByKey.set(key, e);
            continue;
          }

          // Merge pending duplicates by keeping the newest occurrence and the richest fields.
          pendingByKey.set(key, {
            ...existing,
            occurredAt: Math.max(existing.occurredAt, e.occurredAt),
            title: e.title || existing.title,
            preview: e.preview ?? existing.preview,
            sourceEventId: e.sourceEventId ?? existing.sourceEventId,
            chatId: e.chatId ?? existing.chatId,
            sessionKey: e.sessionKey ?? existing.sessionKey,
            terminalId: e.terminalId ?? existing.terminalId,
          });
        }

        const mergedPending = Array.from(pendingByKey.values()).toSorted(sortOldestFirst);
        const mergedEvents = [...nonPending, ...mergedPending];
        const pendingCount = mergedPending.length;
        const cursor = pendingCount === 0 ? 0 : Math.min(state.cursor ?? 0, pendingCount - 1);

        return { ...state, events: mergedEvents, cursor };
      },
    },
  ),
);

export function getPendingTriageEvents(): TriageEvent[] {
  return pendingEvents(useTriageStore.getState().events);
}

export function createTerminalTriageEvent(args: {
  source: Exclude<TriageSource, "gateway">;
  terminalId: string;
  title?: string;
  preview?: string;
  occurredAt?: number;
  sourceEventId?: string;
}): Omit<TriageEvent, "id" | "state"> {
  return {
    source: args.source,
    terminalId: args.terminalId,
    title: args.title ?? "Terminal completion",
    preview: args.preview,
    occurredAt: args.occurredAt ?? Date.now(),
    sourceEventId: args.sourceEventId,
  };
}
