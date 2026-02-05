import { ElectronAPI } from "@electron-toolkit/preload";

// Config types
export interface GlobalConfig {
  version: 1;
  defaultGatewayUrl: string;
  theme: "light" | "dark" | "system";
  sidebarWidth: number;
}

export interface GitHubConfig {
  token: string;
  username: string;
  validatedAt: number;
}

export interface LinearConfig {
  apiKey: string;
  userId: string;
  userName: string;
  validatedAt: number;
}

// Theme types
export interface ThemeDefinitionConfig {
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

export interface ThemesConfig {
  version: 1;
  themes: ThemeDefinitionConfig[];
  activeThemeId: string;
  mode: "light" | "dark" | "system";
}

// Project types
export interface RepoConfig {
  id: string;
  path: string;
  name?: string;
  remoteUrl?: string;
  defaultBranch?: string;
  isMainRepo?: boolean;
}

export interface Project {
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
export interface RepoInfo {
  remoteUrl?: string;
  defaultBranch?: string;
  currentBranch?: string;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  commit: string;
  isMain: boolean;
  isPrunable: boolean;
}

export interface BranchList {
  local: string[];
  remote: string[];
}

export interface RepoStatus {
  ahead: number;
  behind: number;
  dirty: boolean;
}

export interface PullPushResult {
  success: boolean;
  error?: string;
}

export interface DiscoveredRepo {
  path: string;
  name: string;
  remoteUrl?: string;
  defaultBranch?: string;
}

// GitHub types
export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  cloneUrl: string;
  sshUrl: string;
  private: boolean;
  defaultBranch: string;
}

export interface GitHubValidationResult {
  valid: boolean;
  username?: string;
  error?: string;
}

// Linear types
export interface LinearUser {
  id: string;
  name: string;
  displayName: string;
  avatarUrl?: string;
}

export interface LinearState {
  id: string;
  name: string;
  color: string;
  position: number;
  type: "backlog" | "unstarted" | "started" | "completed" | "canceled";
}

export interface LinearLabel {
  id: string;
  name: string;
  color: string;
}

export interface LinearRelation {
  type: "blocks" | "is_blocked_by" | "related" | "duplicate";
  relatedIssue: {
    id: string;
    identifier: string;
    title: string;
    state: {
      name: string;
      type: "backlog" | "unstarted" | "started" | "completed" | "canceled";
    };
  };
}

export interface LinearIssue {
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

export interface LinearTeam {
  id: string;
  name: string;
  key: string;
  states: LinearState[];
}

export interface LinearValidationResult {
  valid: boolean;
  user?: LinearUser;
  error?: string;
}

// Config API
export interface ConfigAPI {
  getGlobal: () => Promise<GlobalConfig>;
  saveGlobal: (config: GlobalConfig) => Promise<void>;
  getGitHub: () => Promise<GitHubConfig | null>;
  saveGitHub: (config: GitHubConfig) => Promise<void>;
  clearGitHub: () => Promise<void>;
  getLinear: () => Promise<LinearConfig | null>;
  saveLinear: (config: LinearConfig) => Promise<void>;
  clearLinear: () => Promise<void>;
  getThemes: () => Promise<ThemesConfig>;
  saveThemes: (config: ThemesConfig) => Promise<void>;
}

// Project API
export interface ProjectsAPI {
  list: () => Promise<Project[]>;
  get: (id: string) => Promise<Project | null>;
  save: (project: Project) => Promise<void>;
  delete: (id: string) => Promise<void>;
  generateId: () => Promise<string>;
}

// Git API
export interface GitAPI {
  isRepo: (path: string) => Promise<boolean>;
  getRepoInfo: (path: string) => Promise<RepoInfo>;
  listWorktrees: (path: string) => Promise<WorktreeInfo[]>;
  createWorktree: (repoPath: string, branch: string, targetPath: string) => Promise<void>;
  removeWorktree: (path: string) => Promise<void>;
  listBranches: (path: string) => Promise<BranchList>;
  getStatus: (path: string) => Promise<RepoStatus>;
  pull: (path: string) => Promise<PullPushResult>;
  push: (path: string) => Promise<PullPushResult>;
  clone: (url: string, targetPath: string) => Promise<void>;
  getDisplayName: (path: string) => Promise<string>;
  onCloneProgress: (callback: (message: string) => void) => () => void;
  scanForRepos: (rootPath: string, maxDepth?: number) => Promise<DiscoveredRepo[]>;
}

// GitHub API
export interface GitHubAPI {
  validate: (token: string) => Promise<GitHubValidationResult>;
  listRepos: () => Promise<GitHubRepo[]>;
  searchRepos: (query: string) => Promise<GitHubRepo[]>;
}

// Linear API
export interface LinearAPI {
  validate: (apiKey: string) => Promise<LinearValidationResult>;
  listTeams: () => Promise<LinearTeam[]>;
  getTeamIssues: (teamId: string) => Promise<LinearIssue[]>;
  updateIssueState: (issueId: string, stateId: string) => Promise<void>;
}

export interface SimulatorWindow {
  windowId: number;
  pid: number;
  title: string;
  bundleId: string;
  bounds: { x: number; y: number; width: number; height: number };
}

export interface SimulatorFrame {
  buffer: Buffer;
  width: number;
  height: number;
  bytesPerRow: number;
  timestamp: number;
}

export interface CaptureConfig {
  fps?: number;
  scaleFactor?: number;
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserTabInfo {
  id: string;
  url: string;
  title: string;
  active: boolean;
}

// Terminal types
export interface TerminalAPI {
  // Create new terminal or reattach to existing one (for HMR persistence)
  create: (
    cwd: string | undefined,
    cols: number,
    rows: number,
    existingId?: string,
  ) => Promise<{ id: string; pid: number }>;
  write: (id: string, data: string) => Promise<void>;
  resize: (id: string, cols: number, rows: number) => Promise<void>;
  kill: (id: string) => Promise<void>;
  // Detach without killing (for HMR - keeps PTY alive)
  detach: (id: string) => Promise<boolean>;
  // Check if terminal still exists in main process
  exists: (id: string) => Promise<boolean>;
  onData: (callback: (id: string, data: string) => void) => () => void;
  onExit: (callback: (id: string, code: number) => void) => () => void;
  // Managed terminal methods (for AI agent control)
  createManaged: (cwd?: string) => Promise<{ id: string; pid: number; managed: true }>;
  execManaged: (
    id: string,
    command: string,
    timeoutMs?: number,
  ) => Promise<{ output: string; exitCode?: number }>;
  readManaged: (id: string, since?: number, maxBytes?: number) => Promise<string>;
  closeManaged: (id: string, force?: boolean) => Promise<void>;
  isManaged: (id: string) => Promise<boolean>;
  listManaged: () => Promise<{ id: string; pid: number; cwd: string; createdAt: number }[]>;
  onManagedOutput: (callback: (data: string) => void) => () => void;
  copyManaged: (id: string) => Promise<{ copied: boolean; length: number }>;
}

export interface BrowserAPI {
  // Initialize browser panel, returns initial tab ID
  create: (bounds: Rectangle) => Promise<string>;
  // Destroy all tabs
  destroy: () => Promise<void>;
  // Update bounds for active tab
  setBounds: (bounds: Rectangle) => Promise<void>;
  // Navigate active tab (or specific tab)
  navigate: (url: string, tabId?: string) => Promise<void>;
  // Execute CDP command on active tab (or specific tab)
  cdp: (method: string, params?: object, tabId?: string) => Promise<unknown>;
  // Open DevTools for active tab (or specific tab)
  openDevTools: (tabId?: string) => Promise<void>;
  // Get CDP URL for active tab (or specific tab)
  getCdpUrl: (tabId?: string) => Promise<string | null>;
  // Focus active tab
  focus: () => Promise<void>;

  // Tab management
  createTab: (url?: string) => Promise<string>;
  closeTab: (tabId: string) => Promise<boolean>;
  switchTab: (tabId: string) => Promise<boolean>;
  listTabs: () => Promise<BrowserTabInfo[]>;
  getTab: (tabId: string) => Promise<BrowserTabInfo | null>;
  getActiveTab: () => Promise<string | null>;
}

// Logs API (for debugging and agent self-iteration)
export interface LogsAPI {
  getMainLogs: () => Promise<string>;
  // Export to ~/.openclaw/kos-debug.log for agent access
  exportToFile: (
    rendererLogs: string,
  ) => Promise<{ success: boolean; path?: string; error?: string }>;
}

export interface SimulatorAPI {
  listWindows: () => Promise<SimulatorWindow[]>;
  hasScreenPermission: () => Promise<boolean>;
  requestScreenPermission: () => Promise<void>;
  hasAccessibilityPermission: () => Promise<boolean>;
  requestAccessibilityPermission: () => Promise<void>;
  startCapture: (
    windowId: number,
    config: CaptureConfig,
  ) => Promise<{ success: boolean; error?: string }>;
  stopCapture: (windowId: number) => Promise<void>;
  injectTap: (windowId: number, x: number, y: number) => Promise<void>;
  injectSwipe: (
    windowId: number,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    durationMs: number,
  ) => Promise<void>;
  injectText: (windowId: number, text: string) => Promise<void>;
  onFrame: (callback: (windowId: number, frame: SimulatorFrame) => void) => () => void;
  onError: (callback: (windowId: number, error: string) => void) => () => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: {
      initialThemeConfig: ThemesConfig | null;
      getGatewayConfig: () => Promise<{ url: string; token?: string; source?: string }>;
      openDirectoryDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>;
      config: ConfigAPI;
      projects: ProjectsAPI;
      git: GitAPI;
      github: GitHubAPI;
      linear: LinearAPI;
      logs: LogsAPI;
      simulator: SimulatorAPI;
      browser: BrowserAPI;
      terminal: TerminalAPI;
    };
  }
}

export {};
