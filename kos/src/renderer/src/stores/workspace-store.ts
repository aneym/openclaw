import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Workspace } from "../types";

// Mock data per spec
const MOCK_WORKSPACES: Workspace[] = [
  // PayMe has multiple workspaces (power user)
  {
    id: "ws-payme-main",
    projectId: "proj-payme",
    name: "main",
    path: "/repos/payme",
    branch: "main",
    isDefault: true,
    createdAt: Date.now() - 86400000 * 30,
  },
  {
    id: "ws-payme-auth",
    projectId: "proj-payme",
    name: "feat/auth",
    path: "/repos/payme-auth",
    branch: "feat/auth",
    isDefault: false,
    createdAt: Date.now() - 86400000 * 5,
  },
  {
    id: "ws-payme-hotfix",
    projectId: "proj-payme",
    name: "hotfix/billing",
    path: "/repos/payme-hotfix",
    branch: "hotfix/billing",
    isDefault: false,
    createdAt: Date.now() - 86400000 * 2,
  },
  // Relay has 1 workspace (normal user)
  {
    id: "ws-relay-main",
    projectId: "proj-relay",
    name: "main",
    path: "/repos/relay",
    branch: "main",
    isDefault: true,
    createdAt: Date.now() - 86400000 * 20,
  },
  // kOS has 1 workspace
  {
    id: "ws-kos-main",
    projectId: "proj-kos",
    name: "main",
    path: "/repos/kos",
    branch: "main",
    isDefault: true,
    createdAt: Date.now() - 86400000 * 10,
  },
  // Wedding has 1 workspace (non-code)
  {
    id: "ws-wedding-main",
    projectId: "proj-wedding",
    name: "Planning",
    path: undefined,
    branch: undefined,
    isDefault: true,
    createdAt: Date.now() - 86400000 * 5,
  },
];

interface WorkspaceState {
  workspaces: Map<string, Workspace>;
  // Map from projectId to active workspaceId
  activeWorkspaceByProject: Map<string, string>;

  // Actions
  setActiveWorkspace: (projectId: string, workspaceId: string) => void;
  addWorkspace: (workspace: Workspace) => void;
  updateWorkspace: (id: string, updates: Partial<Workspace>) => void;
  deleteWorkspace: (id: string) => void;

  // Selectors
  getWorkspace: (id: string) => Workspace | undefined;
  getWorkspacesForProject: (projectId: string) => Workspace[];
  getActiveWorkspace: (projectId: string) => Workspace | undefined;
  shouldShowWorkspaceUI: (projectId: string) => boolean;
}

// Initialize with mock data
const initialWorkspaces = new Map<string, Workspace>();
MOCK_WORKSPACES.forEach((w) => initialWorkspaces.set(w.id, w));

// Set default active workspace per project
const initialActiveByProject = new Map<string, string>();
initialActiveByProject.set("proj-payme", "ws-payme-auth"); // Start on feat/auth for demo
initialActiveByProject.set("proj-relay", "ws-relay-main");
initialActiveByProject.set("proj-kos", "ws-kos-main");
initialActiveByProject.set("proj-wedding", "ws-wedding-main");

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: initialWorkspaces,
      activeWorkspaceByProject: initialActiveByProject,

      setActiveWorkspace: (projectId: string, workspaceId: string) => {
        const workspace = get().workspaces.get(workspaceId);
        if (workspace && workspace.projectId === projectId) {
          const updated = new Map(get().activeWorkspaceByProject);
          updated.set(projectId, workspaceId);
          set({ activeWorkspaceByProject: updated });
        }
      },

      addWorkspace: (workspace: Workspace) => {
        const { workspaces, activeWorkspaceByProject } = get();
        const updated = new Map(workspaces);
        updated.set(workspace.id, workspace);

        // If this is the first workspace for the project, make it active
        const updatedActive = new Map(activeWorkspaceByProject);
        if (!updatedActive.has(workspace.projectId)) {
          updatedActive.set(workspace.projectId, workspace.id);
        }

        set({ workspaces: updated, activeWorkspaceByProject: updatedActive });
      },

      updateWorkspace: (id: string, updates: Partial<Workspace>) => {
        const { workspaces } = get();
        const workspace = workspaces.get(id);
        if (workspace) {
          const updated = new Map(workspaces);
          updated.set(id, { ...workspace, ...updates });
          set({ workspaces: updated });
        }
      },

      deleteWorkspace: (id: string) => {
        const { workspaces, activeWorkspaceByProject } = get();
        const workspace = workspaces.get(id);
        if (!workspace) return;

        const updated = new Map(workspaces);
        updated.delete(id);

        // If deleting active workspace, switch to default
        const updatedActive = new Map(activeWorkspaceByProject);
        if (updatedActive.get(workspace.projectId) === id) {
          const remaining = Array.from(updated.values() as Iterable<Workspace>).filter(
            (w) => w.projectId === workspace.projectId,
          );
          const defaultWs = remaining.find((w) => w.isDefault) || remaining[0];
          if (defaultWs) {
            updatedActive.set(workspace.projectId, defaultWs.id);
          } else {
            updatedActive.delete(workspace.projectId);
          }
        }

        set({ workspaces: updated, activeWorkspaceByProject: updatedActive });
      },

      getWorkspace: (id: string) => {
        return get().workspaces.get(id);
      },

      getWorkspacesForProject: (projectId: string) => {
        return Array.from(get().workspaces.values() as Iterable<Workspace>)
          .filter((w) => w.projectId === projectId)
          .sort((a, b) => {
            // Default workspace first, then alphabetically
            if (a.isDefault && !b.isDefault) return -1;
            if (!a.isDefault && b.isDefault) return 1;
            return a.name.localeCompare(b.name);
          });
      },

      getActiveWorkspace: (projectId: string) => {
        const { workspaces, activeWorkspaceByProject } = get();
        const activeId = activeWorkspaceByProject.get(projectId);
        if (activeId) {
          return workspaces.get(activeId) as Workspace | undefined;
        }
        // Fallback to default workspace
        const projectWorkspaces = Array.from(workspaces.values() as Iterable<Workspace>).filter(
          (w) => w.projectId === projectId,
        );
        return projectWorkspaces.find((w) => w.isDefault) || projectWorkspaces[0];
      },

      shouldShowWorkspaceUI: (projectId: string) => {
        const projectWorkspaces = Array.from(
          get().workspaces.values() as Iterable<Workspace>,
        ).filter((w) => w.projectId === projectId);
        return projectWorkspaces.length > 1;
      },
    }),
    {
      name: "kos-workspaces-v2",
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const { state } = JSON.parse(str);
          return {
            state: {
              ...state,
              workspaces: new Map(state.workspaces || []),
              activeWorkspaceByProject: new Map(state.activeWorkspaceByProject || []),
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
                workspaces: Array.from(state.workspaces.entries()),
                activeWorkspaceByProject: Array.from(state.activeWorkspaceByProject.entries()),
              },
            }),
          );
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    },
  ),
);
