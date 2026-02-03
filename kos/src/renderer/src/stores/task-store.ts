import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Task, TaskStatus } from "../types";

// Mock data per spec
const now = Date.now();
const MOCK_TASKS: Task[] = [
  {
    id: "task-1",
    workspaceId: "ws-payme-auth",
    source: "linear",
    identifier: "PAY-123",
    title: "Implement OAuth",
    description: "Add OAuth 2.0 support for third-party integrations",
    status: "in_progress",
    priority: 2,
    linearIssueId: "lin-123",
    createdAt: now - 86400000 * 3,
    updatedAt: now - 3600000,
  },
  {
    id: "task-2",
    workspaceId: "ws-payme-auth",
    source: "linear",
    identifier: "PAY-124",
    title: "Add refresh token",
    description: "Implement token refresh flow",
    status: "todo",
    priority: 3,
    linearIssueId: "lin-124",
    createdAt: now - 86400000 * 2,
    updatedAt: now - 7200000,
  },
  {
    id: "task-3",
    workspaceId: "ws-payme-auth",
    source: "linear",
    identifier: "PAY-125",
    title: "Write auth tests",
    status: "backlog",
    priority: 4,
    linearIssueId: "lin-125",
    createdAt: now - 86400000,
    updatedAt: now - 86400000,
  },
  {
    id: "task-4",
    workspaceId: "ws-wedding-main",
    source: "local",
    identifier: "W-1",
    title: "Book venue tour",
    description: "Schedule tours at top 3 venues",
    status: "todo",
    priority: 2,
    createdAt: now - 86400000 * 5,
    updatedAt: now - 86400000 * 2,
  },
  {
    id: "task-5",
    workspaceId: "ws-wedding-main",
    source: "local",
    identifier: "W-2",
    title: "Send save the dates",
    status: "backlog",
    priority: 4,
    createdAt: now - 86400000 * 4,
    updatedAt: now - 86400000 * 4,
  },
  {
    id: "task-6",
    workspaceId: "ws-wedding-main",
    source: "local",
    identifier: "W-3",
    title: "Finalize guest list",
    status: "in_progress",
    priority: 1,
    createdAt: now - 86400000 * 3,
    updatedAt: now - 3600000,
  },
  {
    id: "task-7",
    workspaceId: "ws-kos-main",
    source: "linear",
    identifier: "KOS-8",
    title: "Adaptive panel system",
    description: "Panels spawn based on activity",
    status: "in_progress",
    priority: 2,
    linearIssueId: "lin-kos-8",
    createdAt: now - 86400000 * 2,
    updatedAt: now - 1800000,
  },
];

interface TaskState {
  tasks: Map<string, Task>;
  nextLocalId: number;

  // Actions
  addTask: (task: Omit<Task, "id" | "identifier" | "createdAt" | "updatedAt">) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  moveTask: (id: string, newStatus: TaskStatus) => void;

  // Selectors
  getTask: (id: string) => Task | undefined;
  getTasksForWorkspace: (workspaceId: string) => Task[];
  getTasksByStatus: (workspaceId: string, status: TaskStatus) => Task[];
}

// Initialize with mock data
const initialTasks = new Map<string, Task>();
MOCK_TASKS.forEach((t) => initialTasks.set(t.id, t));

export const useTaskStore = create<TaskState>()(
  persist(
    (set, get) => ({
      tasks: initialTasks,
      nextLocalId: 10,

      addTask: (taskData) => {
        const { tasks, nextLocalId } = get();
        const id = `task-${Date.now()}`;
        const timestamp = Date.now();

        const task: Task = {
          ...taskData,
          id,
          identifier: taskData.source === "local" ? `L-${nextLocalId}` : undefined,
          createdAt: timestamp,
          updatedAt: timestamp,
        } as Task;

        const updated = new Map(tasks);
        updated.set(id, task);
        set({ tasks: updated, nextLocalId: nextLocalId + 1 });
      },

      updateTask: (id: string, updates: Partial<Task>) => {
        const { tasks } = get();
        const task = tasks.get(id);
        if (task) {
          const updated = new Map(tasks);
          updated.set(id, { ...task, ...updates, updatedAt: Date.now() });
          set({ tasks: updated });
        }
      },

      deleteTask: (id: string) => {
        const { tasks } = get();
        const updated = new Map(tasks);
        updated.delete(id);
        set({ tasks: updated });
      },

      moveTask: (id: string, newStatus: TaskStatus) => {
        const { tasks } = get();
        const task = tasks.get(id);
        if (task) {
          const updated = new Map(tasks);
          updated.set(id, { ...task, status: newStatus, updatedAt: Date.now() });
          set({ tasks: updated });
        }
      },

      getTask: (id: string) => {
        return get().tasks.get(id);
      },

      getTasksForWorkspace: (workspaceId: string) => {
        return Array.from(get().tasks.values() as Iterable<Task>)
          .filter((t) => t.workspaceId === workspaceId)
          .sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            return b.updatedAt - a.updatedAt;
          });
      },

      getTasksByStatus: (workspaceId: string, status: TaskStatus) => {
        return get()
          .getTasksForWorkspace(workspaceId)
          .filter((t) => t.status === status);
      },
    }),
    {
      name: "kos-tasks",
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const { state } = JSON.parse(str);
          return {
            state: {
              ...state,
              tasks: new Map(state.tasks || []),
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
                tasks: Array.from(state.tasks.entries()),
              },
            }),
          );
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    },
  ),
);
