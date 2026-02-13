import { create } from "zustand";
import { useGatewayStore } from "./gateway-store";

export interface GitFile {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed" | "untracked";
  staged: boolean;
}

interface GitState {
  files: GitFile[];
  branch: string;
  loading: boolean;
  diff: string | null;
  selectedFile: string | null;
  commitMessage: string;
  error: string | null;
  lastRefresh: number;

  refresh: () => Promise<void>;
  stage: (path: string) => Promise<void>;
  unstage: (path: string) => Promise<void>;
  stageAll: () => Promise<void>;
  unstageAll: () => Promise<void>;
  commit: (message: string) => Promise<void>;
  discard: (path: string) => Promise<void>;
  setSelectedFile: (path: string | null) => void;
  setCommitMessage: (msg: string) => void;
  viewDiff: (path: string) => Promise<void>;
}

/** Helper to call gateway RPC */
function request<T>(method: string, params?: unknown): Promise<T> {
  return useGatewayStore.getState().request<T>(method, params);
}

interface GitStatusResponse {
  branch: string;
  files: GitFile[];
}

interface GitDiffResponse {
  diff: string;
}

export const useGitStore = create<GitState>((set, get) => ({
  files: [],
  branch: "",
  loading: false,
  diff: null,
  selectedFile: null,
  commitMessage: "",
  error: null,
  lastRefresh: 0,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const result = await request<GitStatusResponse>("git.status");
      set({
        files: result.files ?? [],
        branch: result.branch ?? "",
        loading: false,
        lastRefresh: Date.now(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch git status";
      set({ loading: false, error: message });
    }
  },

  stage: async (path: string) => {
    try {
      await request("git.stage", { paths: [path] });
      await get().refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to stage file";
      set({ error: message });
    }
  },

  unstage: async (path: string) => {
    try {
      await request("git.unstage", { paths: [path] });
      await get().refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to unstage file";
      set({ error: message });
    }
  },

  stageAll: async () => {
    const paths = get()
      .files.filter((f) => !f.staged)
      .map((f) => f.path);
    if (paths.length === 0) {
      return;
    }
    try {
      await request("git.stage", { paths });
      await get().refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to stage all";
      set({ error: message });
    }
  },

  unstageAll: async () => {
    const paths = get()
      .files.filter((f) => f.staged)
      .map((f) => f.path);
    if (paths.length === 0) {
      return;
    }
    try {
      await request("git.unstage", { paths });
      await get().refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to unstage all";
      set({ error: message });
    }
  },

  commit: async (message: string) => {
    if (!message.trim()) {
      return;
    }
    set({ error: null });
    try {
      await request("git.commit", { message });
      set({ commitMessage: "" });
      await get().refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Commit failed";
      set({ error: msg });
    }
  },

  discard: async (path: string) => {
    try {
      await request("git.discard", { paths: [path] });
      await get().refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to discard changes";
      set({ error: message });
    }
  },

  setSelectedFile: (path: string | null) => set({ selectedFile: path }),

  setCommitMessage: (msg: string) => set({ commitMessage: msg }),

  viewDiff: async (path: string) => {
    set({ selectedFile: path, diff: null });
    try {
      const result = await request<GitDiffResponse>("git.diff", { path });
      set({ diff: result.diff ?? "" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to get diff";
      set({ diff: null, error: message });
    }
  },
}));
