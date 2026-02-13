import { create } from "zustand";
import type { Project, RepoConfig, GitHubRepo, RepoStatus } from "../types";
import { getRendererApi, getRuntimeCapabilities } from "../lib/runtime";
import { useProfileStore } from "./profile-store";
import { useWorkspaceStore } from "./workspace-store";

// Key for persisting active project ID (profile-prefixed)
function getActiveProjectKey(profileId: string): string {
  return `kos-${profileId}-active-project-id`;
}

function resolveStoredActiveProjectId(profileId: string, projects: Map<string, Project>): string {
  const storageKey = getActiveProjectKey(profileId);
  const savedActiveId = localStorage.getItem(storageKey);

  if (!savedActiveId) {
    return "__home__";
  }

  if (savedActiveId.startsWith("__")) {
    return savedActiveId;
  }

  const savedProject = projects.get(savedActiveId);
  if (!savedProject) {
    return "__home__";
  }

  if (!savedProject.profileId || savedProject.profileId === profileId) {
    return savedActiveId;
  }

  return "__home__";
}

function requireProjectAndGitApi(): NonNullable<ReturnType<typeof getRendererApi>> {
  const caps = getRuntimeCapabilities();
  const api = getRendererApi();
  if (!api || !caps.hasProjectApi || !caps.hasGitApi) {
    throw new Error("Project management is only available in the desktop app");
  }
  return api;
}

interface ProjectState {
  projects: Map<string, Project>;
  activeProjectId: string | null;
  isLoading: boolean;
  isInitialized: boolean;
  repoStatuses: Map<string, RepoStatus>;

  // Actions
  initialize: () => Promise<void>;
  resetForProfile: (profileId: string) => void;
  setActiveProject: (id: string) => void;

  // CRUD
  createProject: (
    data: Omit<Project, "id" | "createdAt" | "updatedAt" | "repositories">,
  ) => Promise<Project>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;

  // Repositories (auto-discovered from workspacePath)
  refreshRepositories: (projectId: string) => Promise<void>;
  addRepository: (projectId: string, repoPath: string) => Promise<void>;
  addRepositoryFromGitHub: (
    projectId: string,
    repo: GitHubRepo,
    targetPath: string,
  ) => Promise<void>;
  removeRepository: (projectId: string, repoId: string) => Promise<void>;

  // Git status
  refreshRepoStatus: (repoPath: string) => Promise<void>;
  getRepoStatus: (repoPath: string) => RepoStatus | undefined;

  // Selectors
  getProject: (id: string) => Project | undefined;
  getActiveProject: () => Project | undefined;
  getAllProjects: () => Project[];
  getProjectsForProfile: (profileId: string) => Project[];
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  projects: new Map(),
  activeProjectId: null,
  isLoading: false,
  isInitialized: false,
  repoStatuses: new Map(),

  initialize: async () => {
    if (get().isInitialized) {
      return;
    }

    set({ isLoading: true });
    try {
      const activeProfileId = useProfileStore.getState().activeProfileId;

      const caps = getRuntimeCapabilities();
      const api = getRendererApi();
      if (!caps.hasProjectApi || !api?.projects) {
        const activeId = resolveStoredActiveProjectId(activeProfileId, new Map());
        set({
          projects: new Map(),
          activeProjectId: activeId,
          isInitialized: true,
        });
        return;
      }

      const projects = await api.projects.list();
      const projectsMap = new Map<string, Project>();
      for (const project of projects) {
        projectsMap.set(project.id, project);
      }

      const activeId = resolveStoredActiveProjectId(activeProfileId, projectsMap);

      set({
        projects: projectsMap,
        activeProjectId: activeId,
        isInitialized: true,
      });

      // Refresh repo statuses in background for projects in current profile
      const profileProjects = projects.filter((p) => {
        const proj = p as Project;
        return !proj.profileId || proj.profileId === activeProfileId;
      });
      for (const project of profileProjects) {
        for (const repo of project.repositories) {
          get()
            .refreshRepoStatus(repo.path)
            .catch(() => {});
        }
      }
    } finally {
      set({ isLoading: false });
    }
  },

  resetForProfile: (profileId: string) => {
    const { projects } = get();
    const activeId = resolveStoredActiveProjectId(profileId, projects);

    set({ activeProjectId: activeId });
  },

  setActiveProject: (id: string) => {
    const { projects } = get();
    if (id.startsWith("__") || projects.has(id)) {
      set({ activeProjectId: id });
      const activeProfileId = useProfileStore.getState().activeProfileId;
      localStorage.setItem(getActiveProjectKey(activeProfileId), id);
    }
  },

  createProject: async (data) => {
    const api = requireProjectAndGitApi();
    const id = await api.projects.generateId();
    const now = Date.now();

    // Auto-discover repos from workspacePath
    let repositories: RepoConfig[] = [];
    if (data.workspacePath) {
      const discovered = await api.git.scanForRepos(data.workspacePath);
      repositories = discovered.map((r, i) => ({
        id: `repo-${now}-${i}`,
        path: r.path,
        name: r.name,
        remoteUrl: r.remoteUrl,
        defaultBranch: r.defaultBranch,
        isMainRepo: i === 0,
      }));
    }

    // Auto-assign to active profile
    const activeProfileId = useProfileStore.getState().activeProfileId;

    const project: Project = {
      id,
      profileId: activeProfileId,
      ...data,
      repositories,
      createdAt: now,
      updatedAt: now,
    };

    await api.projects.save(project);

    // Auto-create default workspace for the project
    const workspaceId = `ws-${id}`;
    useWorkspaceStore.getState().addWorkspace({
      id: workspaceId,
      projectId: id,
      name: "Main",
      path: data.workspacePath,
      isDefault: true,
      createdAt: now,
    });

    const { projects } = get();
    const updated = new Map(projects);
    updated.set(id, project);
    set({ projects: updated, activeProjectId: id });
    localStorage.setItem(getActiveProjectKey(activeProfileId), id);

    return project;
  },

  updateProject: async (id, updates) => {
    const { projects } = get();
    const project = projects.get(id);
    if (!project) {
      return;
    }
    const api = requireProjectAndGitApi();

    const updated: Project = {
      ...project,
      ...updates,
      updatedAt: Date.now(),
    };

    await api.projects.save(updated);

    const newProjects = new Map(projects);
    newProjects.set(id, updated);
    set({ projects: newProjects });
  },

  deleteProject: async (id) => {
    const project = get().projects.get(id);
    if (!project) {
      return;
    }
    const api = requireProjectAndGitApi();
    await api.projects.delete(id);

    // Delete associated workspaces
    const workspaceStore = useWorkspaceStore.getState();
    const workspaces = workspaceStore.getWorkspacesForProject(id);
    for (const ws of workspaces) {
      workspaceStore.deleteWorkspace(ws.id);
    }

    const { projects, activeProjectId } = get();
    const updated = new Map(projects);
    updated.delete(id);

    let newActiveId = activeProjectId === id ? "__home__" : activeProjectId;
    set({ projects: updated, activeProjectId: newActiveId });
    if (newActiveId) {
      const activeProfileId = useProfileStore.getState().activeProfileId;
      localStorage.setItem(getActiveProjectKey(activeProfileId), newActiveId);
    }
  },

  refreshRepositories: async (projectId) => {
    const { projects } = get();
    const project = projects.get(projectId);
    if (!project?.workspacePath) {
      return;
    }
    const api = requireProjectAndGitApi();

    const now = Date.now();
    const discovered = await api.git.scanForRepos(project.workspacePath);
    const repositories: RepoConfig[] = discovered.map((r, i) => ({
      id: `repo-${now}-${i}`,
      path: r.path,
      name: r.name,
      remoteUrl: r.remoteUrl,
      defaultBranch: r.defaultBranch,
      isMainRepo: i === 0,
    }));

    const updated: Project = {
      ...project,
      repositories,
      updatedAt: now,
    };

    await api.projects.save(updated);

    const newProjects = new Map(projects);
    newProjects.set(projectId, updated);
    set({ projects: newProjects });

    // Refresh statuses for all repos
    for (const repo of repositories) {
      get()
        .refreshRepoStatus(repo.path)
        .catch(() => {});
    }
  },

  addRepository: async (projectId, repoPath) => {
    const { projects } = get();
    const project = projects.get(projectId);
    if (!project) {
      return;
    }
    const api = requireProjectAndGitApi();

    const isRepo = await api.git.isRepo(repoPath);
    if (!isRepo) {
      throw new Error("Not a valid git repository");
    }

    const repoInfo = await api.git.getRepoInfo(repoPath);
    const displayName = await api.git.getDisplayName(repoPath);

    const newRepo: RepoConfig = {
      id: `repo-${Date.now()}`,
      path: repoPath,
      name: displayName,
      remoteUrl: repoInfo.remoteUrl,
      defaultBranch: repoInfo.defaultBranch,
      isMainRepo: project.repositories.length === 0,
    };

    const updated: Project = {
      ...project,
      repositories: [...project.repositories, newRepo],
      updatedAt: Date.now(),
    };

    await api.projects.save(updated);

    const newProjects = new Map(projects);
    newProjects.set(projectId, updated);
    set({ projects: newProjects });

    get().refreshRepoStatus(repoPath);
  },

  addRepositoryFromGitHub: async (projectId, repo, targetPath) => {
    const api = requireProjectAndGitApi();
    await api.git.clone(repo.sshUrl, targetPath);
    await get().addRepository(projectId, targetPath);
  },

  removeRepository: async (projectId, repoId) => {
    const { projects } = get();
    const project = projects.get(projectId);
    if (!project) {
      return;
    }
    const api = requireProjectAndGitApi();

    const updated: Project = {
      ...project,
      repositories: project.repositories.filter((r) => r.id !== repoId),
      updatedAt: Date.now(),
    };

    if (updated.repositories.length > 0) {
      const hadMainRepo = project.repositories.some((r) => r.id === repoId && r.isMainRepo);
      if (hadMainRepo) {
        updated.repositories[0].isMainRepo = true;
      }
    }

    await api.projects.save(updated);

    const newProjects = new Map(projects);
    newProjects.set(projectId, updated);
    set({ projects: newProjects });
  },

  refreshRepoStatus: async (repoPath) => {
    try {
      const api = getRendererApi();
      if (!api?.git) {
        return;
      }
      const status = await api.git.getStatus(repoPath);
      const { repoStatuses } = get();
      const newStatuses = new Map(repoStatuses);
      newStatuses.set(repoPath, status);
      set({ repoStatuses: newStatuses });
    } catch {
      // Repo might not exist
    }
  },

  getRepoStatus: (repoPath) => get().repoStatuses.get(repoPath),

  getProject: (id) => get().projects.get(id),

  getActiveProject: () => {
    const { projects, activeProjectId } = get();
    return activeProjectId ? projects.get(activeProjectId) : undefined;
  },

  getAllProjects: () =>
    Array.from(get().projects.values()).sort((a, b) => a.name.localeCompare(b.name)),

  getProjectsForProfile: (profileId: string) =>
    Array.from(get().projects.values())
      .filter((p) => !p.profileId || p.profileId === profileId)
      .sort((a, b) => a.name.localeCompare(b.name)),
}));
