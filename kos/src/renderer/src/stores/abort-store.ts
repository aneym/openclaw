/**
 * Abort Store — tracks pending abort requests across reconnects.
 *
 * When an abort is requested while disconnected, store the sessionKey
 * and retry the abort when connection is restored.
 */

import { create } from "zustand";

interface AbortStore {
  /** Set of session keys that have pending abort requests */
  pendingAborts: Set<string>;

  /** Mark a session as having a pending abort */
  markPending: (sessionKey: string) => void;

  /** Clear pending abort for a session */
  clearPending: (sessionKey: string) => void;

  /** Check if a session has a pending abort */
  hasPending: (sessionKey: string) => boolean;

  /** Get all pending abort session keys */
  getPendingKeys: () => string[];

  /** Clear all pending aborts */
  clearAll: () => void;
}

export const useAbortStore = create<AbortStore>((set, get) => ({
  pendingAborts: new Set(),

  markPending: (sessionKey: string) => {
    set((state) => {
      const next = new Set(state.pendingAborts);
      next.add(sessionKey);
      return { pendingAborts: next };
    });
  },

  clearPending: (sessionKey: string) => {
    set((state) => {
      const next = new Set(state.pendingAborts);
      next.delete(sessionKey);
      return { pendingAborts: next };
    });
  },

  hasPending: (sessionKey: string) => {
    return get().pendingAborts.has(sessionKey);
  },

  getPendingKeys: () => {
    return Array.from(get().pendingAborts);
  },

  clearAll: () => {
    set({ pendingAborts: new Set() });
  },
}));
