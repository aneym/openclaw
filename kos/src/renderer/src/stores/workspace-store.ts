import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Workspace } from "../types";
import { HOME_PROJECT_ID } from "../components/layout/ProjectTabs";

// Home workspace ID - exported for use in Shell and other components
export const HOME_WORKSPACE_ID = "__home__";

// Home workspace - for the Home tab that shows all chats
const HOME_WORKSPACE: Workspace = {
  id: HOME_WORKSPACE_ID,
  projectId: HOME_PROJECT_ID,
  name: "Home",
  isDefault: true,
  createdAt: Date.now(),
};

// Default workspaces for each project
const INITIAL_WORKSPACES: Workspace[] = [
  HOME_WORKSPACE,
  {
    id: "ws-payme",
    projectId: "proj-payme",
    name: "Main",
    isDefault: true,
    createdAt: Date.now(),
  },
  {
    id: "ws-relay",
    projectId: "proj-relay",
    name: "Main",
    isDefault: true,
    createdAt: Date.now(),
  },
  {
    id: "ws-kos",
    projectId: "proj-kos",
    name: "Main",
    isDefault: true,
    createdAt: Date.now(),
  },
  {
    id: "ws-wedding",
    projectId: "proj-wedding",
    name: "Main",
    isDefault: true,
    createdAt: Date.now(),
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

// Initialize with workspaces for each project
const initialWorkspaces = new Map<string, Workspace>();
INITIAL_WORKSPACES.forEach((ws) => initialWorkspaces.set(ws.id, ws));

// Active workspace per project
const initialActiveByProject = new Map<string, string>();
INITIAL_WORKSPACES.forEach((ws) => {
  if (ws.isDefault) {
    initialActiveByProject.set(ws.projectId, ws.id);
  }
});

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
        const existing = projectWorkspaces.find((w) => w.isDefault) || projectWorkspaces[0];
        if (existing) {
          return existing;
        }

        // Auto-create workspace for existing projects without one (migration)
        if (!projectId.startsWith("__")) {
          const now = Date.now();
          const newWorkspace: Workspace = {
            id: `ws-${projectId}`,
            projectId,
            name: "Main",
            isDefault: true,
            createdAt: now,
          };
          get().addWorkspace(newWorkspace);
          return newWorkspace;
        }

        return undefined;
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
      // Run migration after hydration to ensure Home workspace exists
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Check if Home workspace is missing and add it
          if (!state.workspaces.has(HOME_WORKSPACE.id)) {
            const updated = new Map(state.workspaces)
            updated.set(HOME_WORKSPACE.id, HOME_WORKSPACE)
            const updatedActive = new Map(state.activeWorkspaceByProject)
            updatedActive.set(HOME_PROJECT_ID, HOME_WORKSPACE.id)
            useWorkspaceStore.setState({
              workspaces: updated,
              activeWorkspaceByProject: updatedActive,
            })
          }
        }
      },
    },
  ),
);
