import { electronAPI } from "@electron-toolkit/preload";
import { contextBridge, ipcRenderer } from "electron";

// Simulator types
interface SimulatorWindow {
  windowId: number;
  pid: number;
  title: string;
  bundleId: string;
  bounds: { x: number; y: number; width: number; height: number };
}

interface SimulatorFrame {
  buffer: Buffer;
  width: number;
  height: number;
  bytesPerRow: number;
  timestamp: number;
}

interface CaptureConfig {
  fps?: number;
  scaleFactor?: number;
}

interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Config types
interface GlobalConfig {
  version: 1;
  defaultGatewayUrl: string;
  theme: "light" | "dark" | "system";
  sidebarWidth: number;
}

interface GitHubConfig {
  token: string;
  username: string;
  validatedAt: number;
}

interface LinearConfig {
  apiKey: string;
  userId: string;
  userName: string;
  validatedAt: number;
}

// Theme types
interface ThemeDefinitionPreload {
  id: string;
  name: string;
  source?: string;
  isBuiltIn: boolean;
  cssVars: {
    theme?: Record<string, string>;
    light: Record<string, string>;
    dark: Record<string, string>;
  };
  installedAt: number;
}

interface ThemesConfig {
  version: 1;
  themes: ThemeDefinitionPreload[];
  activeThemeId: string;
  mode: "light" | "dark" | "system";
}

// Project types
interface RepoConfig {
  id: string;
  path: string;
  name?: string;
  remoteUrl?: string;
  defaultBranch?: string;
  isMainRepo?: boolean;
}

interface Project {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  linearTeamId?: string;
  workspacePath?: string;
  repositories: RepoConfig[];
  createdAt: number;
  updatedAt: number;
}

// Git types
interface RepoInfo {
  remoteUrl?: string;
  defaultBranch?: string;
  currentBranch?: string;
}

interface WorktreeInfo {
  path: string;
  branch: string;
  commit: string;
  isMain: boolean;
  isPrunable: boolean;
}

interface BranchList {
  local: string[];
  remote: string[];
}

interface RepoStatus {
  ahead: number;
  behind: number;
  dirty: boolean;
}

interface PullPushResult {
  success: boolean;
  error?: string;
}

// GitHub types
interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  cloneUrl: string;
  sshUrl: string;
  private: boolean;
  defaultBranch: string;
}

interface GitHubValidationResult {
  valid: boolean;
  username?: string;
  error?: string;
}

// Linear types
interface LinearUser {
  id: string;
  name: string;
  displayName: string;
  avatarUrl?: string;
}

interface LinearState {
  id: string;
  name: string;
  color: string;
  position: number;
  type: "backlog" | "unstarted" | "started" | "completed" | "canceled";
}

interface LinearLabel {
  id: string;
  name: string;
  color: string;
}

interface LinearRelation {
  type: "blocks" | "is_blocked_by" | "related" | "duplicate";
  relatedIssue: {
    id: string;
    identifier: string;
    title: string;
    state: { name: string };
  };
}

interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  priority: number;
  state: LinearState;
  assignee?: LinearUser;
  labels: LinearLabel[];
  relations: LinearRelation[];
  isBlocked?: boolean;
  downstreamCount?: number;
}

interface LinearTeam {
  id: string;
  name: string;
  key: string;
  states: LinearState[];
}

interface LinearValidationResult {
  valid: boolean;
  user?: LinearUser;
  error?: string;
}

// Read theme config synchronously to prevent flash of wrong theme on startup.
// Exposed on window.api so the renderer can apply the dark class before React mounts.
const initialThemeConfig: ThemesConfig | null = (() => {
  try {
    return ipcRenderer.sendSync("config:getThemesSync") as ThemesConfig;
  } catch {
    return null;
  }
})();

// Custom APIs for renderer
const api = {
  initialThemeConfig,
  getGatewayConfig: (): Promise<{ url: string; token?: string; source?: string }> =>
    ipcRenderer.invoke("get-gateway-config"),
  openDirectoryDialog: (): Promise<{ canceled: boolean; filePaths: string[] }> =>
    ipcRenderer.invoke("dialog:openDirectory"),

  // Logs API (for debugging and agent self-iteration)
  logs: {
    getMainLogs: (): Promise<string> => ipcRenderer.invoke("logs:getMainLogs"),
    // Export to ~/.openclaw/kos-debug.log for agent access
    exportToFile: (
      rendererLogs: string,
    ): Promise<{ success: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke("logs:exportToFile", rendererLogs),
  },

  // Config APIs
  config: {
    getGlobal: (): Promise<GlobalConfig> => ipcRenderer.invoke("config:getGlobal"),
    saveGlobal: (config: GlobalConfig): Promise<void> =>
      ipcRenderer.invoke("config:saveGlobal", config),
    getGitHub: (): Promise<GitHubConfig | null> => ipcRenderer.invoke("config:getGitHub"),
    saveGitHub: (config: GitHubConfig): Promise<void> =>
      ipcRenderer.invoke("config:saveGitHub", config),
    clearGitHub: (): Promise<void> => ipcRenderer.invoke("config:clearGitHub"),
    getLinear: (): Promise<LinearConfig | null> => ipcRenderer.invoke("config:getLinear"),
    saveLinear: (config: LinearConfig): Promise<void> =>
      ipcRenderer.invoke("config:saveLinear", config),
    clearLinear: (): Promise<void> => ipcRenderer.invoke("config:clearLinear"),
    getThemes: (): Promise<ThemesConfig> => ipcRenderer.invoke("config:getThemes"),
    saveThemes: (config: ThemesConfig): Promise<void> =>
      ipcRenderer.invoke("config:saveThemes", config),
  },

  // Project APIs
  projects: {
    list: (): Promise<Project[]> => ipcRenderer.invoke("projects:list"),
    get: (id: string): Promise<Project | null> => ipcRenderer.invoke("projects:get", id),
    save: (project: Project): Promise<void> => ipcRenderer.invoke("projects:save", project),
    delete: (id: string): Promise<void> => ipcRenderer.invoke("projects:delete", id),
    generateId: (): Promise<string> => ipcRenderer.invoke("projects:generateId"),
  },

  // Git APIs
  git: {
    isRepo: (path: string): Promise<boolean> => ipcRenderer.invoke("git:isRepo", path),
    getRepoInfo: (path: string): Promise<RepoInfo> => ipcRenderer.invoke("git:getRepoInfo", path),
    listWorktrees: (path: string): Promise<WorktreeInfo[]> =>
      ipcRenderer.invoke("git:listWorktrees", path),
    createWorktree: (repoPath: string, branch: string, targetPath: string): Promise<void> =>
      ipcRenderer.invoke("git:createWorktree", repoPath, branch, targetPath),
    removeWorktree: (path: string): Promise<void> => ipcRenderer.invoke("git:removeWorktree", path),
    listBranches: (path: string): Promise<BranchList> =>
      ipcRenderer.invoke("git:listBranches", path),
    getStatus: (path: string): Promise<RepoStatus> => ipcRenderer.invoke("git:getStatus", path),
    pull: (path: string): Promise<PullPushResult> => ipcRenderer.invoke("git:pull", path),
    push: (path: string): Promise<PullPushResult> => ipcRenderer.invoke("git:push", path),
    clone: (url: string, targetPath: string): Promise<void> =>
      ipcRenderer.invoke("git:clone", url, targetPath),
    getDisplayName: (path: string): Promise<string> =>
      ipcRenderer.invoke("git:getDisplayName", path),
    onCloneProgress: (callback: (message: string) => void) => {
      const listener = (_: unknown, message: string) => callback(message);
      ipcRenderer.on("git:clone-progress", listener);
      return () => ipcRenderer.removeListener("git:clone-progress", listener);
    },
    scanForRepos: (
      rootPath: string,
      maxDepth?: number,
    ): Promise<{ path: string; name: string; remoteUrl?: string; defaultBranch?: string }[]> =>
      ipcRenderer.invoke("git:scanForRepos", rootPath, maxDepth),
  },

  // GitHub APIs
  github: {
    validate: (token: string): Promise<GitHubValidationResult> =>
      ipcRenderer.invoke("github:validate", token),
    listRepos: (): Promise<GitHubRepo[]> => ipcRenderer.invoke("github:listRepos"),
    searchRepos: (query: string): Promise<GitHubRepo[]> =>
      ipcRenderer.invoke("github:searchRepos", query),
  },

  // Linear APIs
  linear: {
    validate: (apiKey: string): Promise<LinearValidationResult> =>
      ipcRenderer.invoke("linear:validate", apiKey),
    listTeams: (): Promise<LinearTeam[]> => ipcRenderer.invoke("linear:listTeams"),
    getTeamIssues: (teamId: string): Promise<LinearIssue[]> =>
      ipcRenderer.invoke("linear:getTeamIssues", teamId),
    updateIssueState: (issueId: string, stateId: string): Promise<void> =>
      ipcRenderer.invoke("linear:updateIssueState", issueId, stateId),
  },

  // iOS Simulator APIs
  simulator: {
    listWindows: (): Promise<SimulatorWindow[]> => ipcRenderer.invoke("simulator:list-windows"),
    hasScreenPermission: (): Promise<boolean> =>
      ipcRenderer.invoke("simulator:has-screen-permission"),
    requestScreenPermission: (): Promise<void> =>
      ipcRenderer.invoke("simulator:request-screen-permission"),
    hasAccessibilityPermission: (): Promise<boolean> =>
      ipcRenderer.invoke("simulator:has-accessibility-permission"),
    requestAccessibilityPermission: (): Promise<void> =>
      ipcRenderer.invoke("simulator:request-accessibility-permission"),
    startCapture: (
      windowId: number,
      config: CaptureConfig,
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke("simulator:start-capture", windowId, config),
    stopCapture: (windowId: number): Promise<void> =>
      ipcRenderer.invoke("simulator:stop-capture", windowId),
    injectTap: (windowId: number, x: number, y: number): Promise<void> =>
      ipcRenderer.invoke("simulator:inject-tap", windowId, x, y),
    injectSwipe: (
      windowId: number,
      startX: number,
      startY: number,
      endX: number,
      endY: number,
      durationMs: number,
    ): Promise<void> =>
      ipcRenderer.invoke(
        "simulator:inject-swipe",
        windowId,
        startX,
        startY,
        endX,
        endY,
        durationMs,
      ),
    injectText: (windowId: number, text: string): Promise<void> =>
      ipcRenderer.invoke("simulator:inject-text", windowId, text),
    onFrame: (callback: (windowId: number, frame: SimulatorFrame) => void) => {
      const listener = (_: unknown, windowId: number, frame: SimulatorFrame) =>
        callback(windowId, frame);
      ipcRenderer.on("simulator:frame", listener);
      return () => ipcRenderer.removeListener("simulator:frame", listener);
    },
    onError: (callback: (windowId: number, error: string) => void) => {
      const listener = (_: unknown, windowId: number, error: string) => callback(windowId, error);
      ipcRenderer.on("simulator:error", listener);
      return () => ipcRenderer.removeListener("simulator:error", listener);
    },
  },

  // Terminal APIs
  terminal: {
    // Create new terminal or reattach to existing one (for HMR persistence)
    create: (
      cwd: string | undefined,
      cols: number,
      rows: number,
      existingId?: string,
    ): Promise<{ id: string; pid: number }> =>
      ipcRenderer.invoke("terminal:create", cwd, cols, rows, existingId),
    write: (id: string, data: string): Promise<void> =>
      ipcRenderer.invoke("terminal:write", id, data),
    resize: (id: string, cols: number, rows: number): Promise<void> =>
      ipcRenderer.invoke("terminal:resize", id, cols, rows),
    kill: (id: string): Promise<void> => ipcRenderer.invoke("terminal:kill", id),
    // Detach without killing (for HMR - keeps PTY alive)
    detach: (id: string): Promise<boolean> => ipcRenderer.invoke("terminal:detach", id),
    // Check if terminal still exists in main process
    exists: (id: string): Promise<boolean> => ipcRenderer.invoke("terminal:exists", id),
    onData: (callback: (id: string, data: string) => void) => {
      const listener = (_: unknown, id: string, data: string) => callback(id, data);
      ipcRenderer.on("terminal:data", listener);
      return () => ipcRenderer.removeListener("terminal:data", listener);
    },
    onExit: (callback: (id: string, code: number) => void) => {
      const listener = (_: unknown, id: string, code: number) => callback(id, code);
      ipcRenderer.on("terminal:exit", listener);
      return () => ipcRenderer.removeListener("terminal:exit", listener);
    },
    // Managed terminal methods (for AI agent control)
    createManaged: (cwd?: string): Promise<{ id: string; pid: number; managed: true }> =>
      ipcRenderer.invoke("terminal:createManaged", cwd),
    execManaged: (
      id: string,
      command: string,
      timeoutMs?: number,
    ): Promise<{ output: string; exitCode?: number }> =>
      ipcRenderer.invoke("terminal:execManaged", id, command, timeoutMs),
    readManaged: (id: string, since?: number, maxBytes?: number): Promise<string> =>
      ipcRenderer.invoke("terminal:readManaged", id, since, maxBytes),
    closeManaged: (id: string, force?: boolean): Promise<void> =>
      ipcRenderer.invoke("terminal:closeManaged", id, force),
    isManaged: (id: string): Promise<boolean> => ipcRenderer.invoke("terminal:isManaged", id),
    listManaged: (): Promise<{ id: string; pid: number; cwd: string; createdAt: number }[]> =>
      ipcRenderer.invoke("terminal:listManaged"),
    onManagedOutput: (callback: (data: string) => void) => {
      const listener = (_: unknown, data: string) => callback(data);
      ipcRenderer.on("terminal:managed-output", listener);
      return () => ipcRenderer.removeListener("terminal:managed-output", listener);
    },
    copyManaged: (id: string): Promise<{ copied: boolean; length: number }> =>
      ipcRenderer.invoke("terminal:copyManaged", id),
  },

  // Browser panel APIs (multi-tab support)
  browser: {
    // Initialize browser panel, returns initial tab ID
    create: (bounds: Rectangle): Promise<string> => ipcRenderer.invoke("browser:create", bounds),
    // Destroy all tabs
    destroy: (): Promise<void> => ipcRenderer.invoke("browser:destroy"),
    // Update bounds for active tab
    setBounds: (bounds: Rectangle): Promise<void> =>
      ipcRenderer.invoke("browser:set-bounds", bounds),
    // Navigate active tab (or specific tab)
    navigate: (url: string, tabId?: string): Promise<void> =>
      ipcRenderer.invoke("browser:navigate", url, tabId),
    // Execute CDP command on active tab (or specific tab)
    cdp: (method: string, params?: object, tabId?: string): Promise<unknown> =>
      ipcRenderer.invoke("browser:cdp", method, params, tabId),
    // Open DevTools for active tab (or specific tab)
    openDevTools: (tabId?: string): Promise<void> => ipcRenderer.invoke("browser:devtools", tabId),
    // Get CDP URL for active tab (or specific tab)
    getCdpUrl: (tabId?: string): Promise<string | null> =>
      ipcRenderer.invoke("browser:get-cdp-url", tabId),
    // Focus active tab
    focus: (): Promise<void> => ipcRenderer.invoke("browser:focus"),

    // Tab management
    createTab: (url?: string): Promise<string> => ipcRenderer.invoke("browser:create-tab", url),
    closeTab: (tabId: string): Promise<boolean> => ipcRenderer.invoke("browser:close-tab", tabId),
    switchTab: (tabId: string): Promise<boolean> => ipcRenderer.invoke("browser:switch-tab", tabId),
    listTabs: (): Promise<{ id: string; url: string; title: string; active: boolean }[]> =>
      ipcRenderer.invoke("browser:list-tabs"),
    getTab: (
      tabId: string,
    ): Promise<{ id: string; url: string; title: string; active: boolean } | null> =>
      ipcRenderer.invoke("browser:get-tab", tabId),
    getActiveTab: (): Promise<string | null> => ipcRenderer.invoke("browser:get-active-tab"),
  },
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
}
