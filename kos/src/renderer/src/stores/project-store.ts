import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Project } from "../types";

// Mock data per spec
const MOCK_PROJECTS: Project[] = [
  {
    id: "proj-payme",
    name: "PayMe",
    icon: "💰",
    linearTeamId: "team-pay",
    repositoryPath: "/repos/payme",
    createdAt: Date.now() - 86400000 * 30,
  },
  {
    id: "proj-relay",
    name: "Relay",
    icon: "🔗",
    linearTeamId: "team-rel",
    repositoryPath: "/repos/relay",
    createdAt: Date.now() - 86400000 * 20,
  },
  {
    id: "proj-kos",
    name: "kOS",
    icon: "🤖",
    linearTeamId: "team-kos",
    repositoryPath: "/repos/kos",
    createdAt: Date.now() - 86400000 * 10,
  },
  {
    id: "proj-wedding",
    name: "Wedding",
    icon: "💒",
    repositoryPath: undefined, // non-code project
    createdAt: Date.now() - 86400000 * 5,
  },
];

interface ProjectState {
  projects: Map<string, Project>;
  activeProjectId: string | null;

  // Actions
  setActiveProject: (id: string) => void;
  addProject: (project: Project) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;

  // Selectors (use outside of selectors with useMemo)
  getProject: (id: string) => Project | undefined;
  getActiveProject: () => Project | undefined;
  getAllProjects: () => Project[];
}

// Initialize with mock data
const initialProjects = new Map<string, Project>();
MOCK_PROJECTS.forEach((p) => initialProjects.set(p.id, p));

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: initialProjects,
      activeProjectId: "proj-payme",

      setActiveProject: (id: string) => {
        console.log("[ProjectStore] setActiveProject called with:", id);
        // Allow special IDs like "__dashboard__" or valid project IDs
        if (id.startsWith("__") || get().projects.get(id)) {
          console.log("[ProjectStore] Setting activeProjectId to:", id);
          set({ activeProjectId: id });
        } else {
          console.log("[ProjectStore] Rejected - not a valid project or special ID");
        }
      },

      addProject: (project: Project) => {
        const { projects } = get();
        const updated = new Map(projects);
        updated.set(project.id, project);
        set({ projects: updated });
      },

      updateProject: (id: string, updates: Partial<Project>) => {
        const { projects } = get();
        const project = projects.get(id);
        if (project) {
          const updated = new Map(projects);
          updated.set(id, { ...project, ...updates });
          set({ projects: updated });
        }
      },

      deleteProject: (id: string) => {
        const { projects, activeProjectId } = get();
        const updated = new Map(projects);
        updated.delete(id);
        set({
          projects: updated,
          activeProjectId: activeProjectId === id ? null : activeProjectId,
        });
      },

      getProject: (id: string) => {
        return get().projects.get(id);
      },

      getActiveProject: () => {
        const { projects, activeProjectId } = get();
        return activeProjectId ? projects.get(activeProjectId) : undefined;
      },

      getAllProjects: () => {
        return Array.from(get().projects.values() as Iterable<Project>).sort((a, b) =>
          a.name.localeCompare(b.name),
        );
      },
    }),
    {
      name: "kos-projects-v2",
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const { state } = JSON.parse(str);
          return {
            state: {
              ...state,
              projects: new Map(state.projects || []),
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
                projects: Array.from(state.projects.entries()),
              },
            }),
          );
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    },
  ),
);
