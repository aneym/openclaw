import { create } from "zustand";
import { useGatewayStore } from "./gateway-store";

export type TaskStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "blocked"
  | "review"
  | "done"
  | "cancelled";

export type TaskPriority = "none" | "low" | "medium" | "high" | "urgent";

export interface GatewayTask {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigned_to: string | null;
  created_by: string | null;
  sort_order: number;
  labels: string; // JSON string of string[]
  due_date: number | null; // epoch ms
  metadata: string; // JSON string
  created_at: number; // epoch ms
  updated_at: number; // epoch ms
}

export interface GatewayTaskProject {
  id: string;
  name: string;
  slug: string;
  agent: string | null;
  description: string | null;
  color: string | null;
  created_at: number;
  updated_at: number;
}

interface GatewayTasksState {
  tasks: GatewayTask[];
  projects: GatewayTaskProject[];
  activeProjectId: string | null;
  loading: boolean;
  error: string | null;

  // Actions
  fetchProjects: () => Promise<void>;
  fetchTasks: (projectSlug?: string) => Promise<void>;
  createTask: (task: {
    project_id: string;
    title: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
  }) => Promise<void>;
  updateTask: (id: string, updates: Partial<GatewayTask>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  reorderTask: (id: string, status: TaskStatus, sortOrder: number) => Promise<void>;
  setActiveProject: (id: string | null) => void;
}

/** Convert the gateway WebSocket URL (ws://...) to an HTTP base URL */
function getHttpBaseUrl(): string {
  const wsUrl = useGatewayStore.getState().currentUrl;
  if (!wsUrl) {
    throw new Error("Gateway not connected");
  }
  return wsUrl.replace(/^ws(s?):\/\//, "http$1://");
}

function getAuthHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
  };
}

export const useGatewayTasksStore = create<GatewayTasksState>()((set, get) => ({
  tasks: [],
  projects: [],
  activeProjectId: null,
  loading: false,
  error: null,

  fetchProjects: async () => {
    try {
      const base = getHttpBaseUrl();
      const res = await fetch(`${base}/api/tasks/projects`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      set({ projects: data.projects ?? [] });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch projects";
      set({ error: message });
    }
  },

  fetchTasks: async (projectSlug?: string) => {
    set({ loading: true, error: null });
    try {
      const base = getHttpBaseUrl();
      const params = projectSlug ? `?project=${encodeURIComponent(projectSlug)}` : "";
      const res = await fetch(`${base}/api/tasks${params}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      set({ tasks: data.tasks ?? [] });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch tasks";
      set({ error: message });
    } finally {
      set({ loading: false });
    }
  },

  createTask: async (task) => {
    try {
      const base = getHttpBaseUrl();
      const res = await fetch(`${base}/api/tasks`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(task),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      // Refetch tasks after creation
      const activeProject = get().projects.find((p) => p.id === get().activeProjectId);
      await get().fetchTasks(activeProject?.slug);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create task";
      set({ error: message });
      throw err;
    }
  },

  updateTask: async (id, updates) => {
    // Optimistic update
    const prevTasks = get().tasks;
    set({
      tasks: prevTasks.map((t) => (t.id === id ? { ...t, ...updates, updated_at: Date.now() } : t)),
    });

    try {
      const base = getHttpBaseUrl();
      const res = await fetch(`${base}/api/tasks/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      // Revert on failure
      set({ tasks: prevTasks });
      const message = err instanceof Error ? err.message : "Failed to update task";
      set({ error: message });
      throw err;
    }
  },

  deleteTask: async (id) => {
    const prevTasks = get().tasks;
    set({ tasks: prevTasks.filter((t) => t.id !== id) });

    try {
      const base = getHttpBaseUrl();
      const res = await fetch(`${base}/api/tasks/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      set({ tasks: prevTasks });
      const message = err instanceof Error ? err.message : "Failed to delete task";
      set({ error: message });
      throw err;
    }
  },

  reorderTask: async (id, status, sortOrder) => {
    // Optimistic: update status + sort_order locally
    const prevTasks = get().tasks;
    set({
      tasks: prevTasks.map((t) =>
        t.id === id ? { ...t, status, sort_order: sortOrder, updated_at: Date.now() } : t,
      ),
    });

    try {
      const base = getHttpBaseUrl();
      const res = await fetch(`${base}/api/tasks/${encodeURIComponent(id)}/reorder`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ status, sort_order: sortOrder }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      set({ tasks: prevTasks });
      const message = err instanceof Error ? err.message : "Failed to reorder task";
      set({ error: message });
      throw err;
    }
  },

  setActiveProject: (id) => set({ activeProjectId: id }),
}));
