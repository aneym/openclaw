import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Thread } from "../types";
import { useProjectStore } from "./project-store";
import { useWorkspaceStore } from "./workspace-store";

type ThreadRecord = Omit<Thread, "tabId"> & { tabId?: string | null };

const resolveWorkspaceId = (projectId?: string) => {
  if (projectId) {
    const project = useProjectStore.getState().projects.get(projectId);
    if (project?.workspaceId) {
      return project.workspaceId;
    }
  }

  const workspaceState = useWorkspaceStore.getState();
  return workspaceState.activeWorkspace?.id ?? workspaceState.config.activeWorkspaceId ?? "default";
};

const ensureThreadTabId = (thread: ThreadRecord): Thread => {
  if (thread.tabId) {
    return thread as Thread;
  }

  const workspaceId = resolveWorkspaceId(thread.projectId);
  return { ...thread, tabId: `home-${workspaceId}` };
};

interface ThreadState {
  threads: Map<string, Thread>;
  activeThreadId: string | null;
  isLoading: boolean;

  setActiveThread: (id: string | null) => void;
  addThread: (thread: Thread) => void;
  updateThread: (id: string, patch: Partial<Thread>) => void;
  archiveThread: (id: string) => void;
  unarchiveThread: (id: string) => void;
  getThread: (id: string) => Thread | undefined;
  getThreadsByProject: (projectId: string) => Thread[];
  getThreadByLinearIssue: (linearIssueId: string) => Thread | undefined;
  setLoading: (loading: boolean) => void;
}

export const useThreadStore = create<ThreadState>()(
  persist(
    (set, get) => ({
      threads: new Map(),
      activeThreadId: null,
      isLoading: false,

      setActiveThread: (id: string | null) => {
        if (!id) {
          set({ activeThreadId: null });
          return;
        }
        const thread = get().threads.get(id);
        if (thread) {
          set({ activeThreadId: id });
        }
      },

      addThread: (thread: Thread) => {
        const { threads } = get();
        const normalized = ensureThreadTabId(thread);
        const updated = new Map(threads);
        updated.set(thread.id, normalized);
        set({ threads: updated });
      },

      updateThread: (id: string, patch: Partial<Thread>) => {
        const { threads } = get();
        const thread = threads.get(id);
        if (thread) {
          const updated = new Map(threads);
          const normalized = ensureThreadTabId({ ...thread, ...patch });
          updated.set(id, normalized);
          set({ threads: updated });
        }
      },

      archiveThread: (id: string) => {
        const { threads, activeThreadId } = get();
        const thread = threads.get(id);
        if (thread) {
          const updated = new Map(threads);
          updated.set(id, { ...thread, status: "archived" });
          set({
            threads: updated,
            activeThreadId: activeThreadId === id ? null : activeThreadId,
          });
        }
      },

      unarchiveThread: (id: string) => {
        const { threads } = get();
        const thread = threads.get(id);
        if (thread) {
          const updated = new Map(threads);
          updated.set(id, { ...thread, status: "active" });
          set({ threads: updated });
        }
      },

      getThread: (id: string) => {
        return get().threads.get(id);
      },

      getThreadsByProject: (projectId: string) => {
        const { threads } = get();
        return Array.from(threads.values()).filter(
          (t) => t.projectId === projectId && t.status !== "archived",
        );
      },

      getThreadByLinearIssue: (linearIssueId: string) => {
        const { threads } = get();
        return Array.from(threads.values()).find(
          (t) => t.linearIssueId === linearIssueId && t.status !== "archived",
        );
      },
      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },
    }),
    {
      name: "kos-threads",
      // Custom storage to handle Map serialization
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const { state } = JSON.parse(str);
          const rawThreads = new Map(state.threads || []);
          const normalizedThreads = new Map<string, Thread>();
          rawThreads.forEach((thread, id) => {
            // Handle partial thread records from storage
            const partial = thread as { id?: string; tabId?: string | null };
            if (partial.id && partial.tabId !== undefined && typeof id === "string") {
              // Only process threads that have an id and valid tabId
              normalizedThreads.set(id, ensureThreadTabId(partial as ThreadRecord));
            }
          });
          return {
            state: {
              ...state,
              threads: normalizedThreads,
            },
          };
        },
        setItem: (name, value) => {
          const { state } = value;
          localStorage.setItem(
            name,
            JSON.stringify({
              state: {
                ...state,
                threads: Array.from(state.threads.entries()),
              },
            }),
          );
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    },
  ),
);
