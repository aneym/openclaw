"use strict";
const preload = require("@electron-toolkit/preload");
const electron = require("electron");
const api = {
  getGatewayConfig: () => electron.ipcRenderer.invoke("get-gateway-config"),
  openDirectoryDialog: () => electron.ipcRenderer.invoke("dialog:openDirectory"),
  // Logs API (for debugging and agent self-iteration)
  logs: {
    getMainLogs: () => electron.ipcRenderer.invoke("logs:getMainLogs"),
    // Export to ~/.openclaw/kos-debug.log for agent access
    exportToFile: (rendererLogs) => electron.ipcRenderer.invoke("logs:exportToFile", rendererLogs),
  },
  // Config APIs
  config: {
    getGlobal: () => electron.ipcRenderer.invoke("config:getGlobal"),
    saveGlobal: (config) => electron.ipcRenderer.invoke("config:saveGlobal", config),
    getGitHub: () => electron.ipcRenderer.invoke("config:getGitHub"),
    saveGitHub: (config) => electron.ipcRenderer.invoke("config:saveGitHub", config),
    clearGitHub: () => electron.ipcRenderer.invoke("config:clearGitHub"),
    getLinear: () => electron.ipcRenderer.invoke("config:getLinear"),
    saveLinear: (config) => electron.ipcRenderer.invoke("config:saveLinear", config),
    clearLinear: () => electron.ipcRenderer.invoke("config:clearLinear"),
    getThemes: () => electron.ipcRenderer.invoke("config:getThemes"),
    saveThemes: (config) => electron.ipcRenderer.invoke("config:saveThemes", config),
  },
  // Project APIs
  projects: {
    list: () => electron.ipcRenderer.invoke("projects:list"),
    get: (id) => electron.ipcRenderer.invoke("projects:get", id),
    save: (project) => electron.ipcRenderer.invoke("projects:save", project),
    delete: (id) => electron.ipcRenderer.invoke("projects:delete", id),
    generateId: () => electron.ipcRenderer.invoke("projects:generateId"),
  },
  // Git APIs
  git: {
    isRepo: (path) => electron.ipcRenderer.invoke("git:isRepo", path),
    getRepoInfo: (path) => electron.ipcRenderer.invoke("git:getRepoInfo", path),
    listWorktrees: (path) => electron.ipcRenderer.invoke("git:listWorktrees", path),
    createWorktree: (repoPath, branch, targetPath) =>
      electron.ipcRenderer.invoke("git:createWorktree", repoPath, branch, targetPath),
    removeWorktree: (path) => electron.ipcRenderer.invoke("git:removeWorktree", path),
    listBranches: (path) => electron.ipcRenderer.invoke("git:listBranches", path),
    getStatus: (path) => electron.ipcRenderer.invoke("git:getStatus", path),
    pull: (path) => electron.ipcRenderer.invoke("git:pull", path),
    push: (path) => electron.ipcRenderer.invoke("git:push", path),
    clone: (url, targetPath) => electron.ipcRenderer.invoke("git:clone", url, targetPath),
    getDisplayName: (path) => electron.ipcRenderer.invoke("git:getDisplayName", path),
    onCloneProgress: (callback) => {
      const listener = (_, message) => callback(message);
      electron.ipcRenderer.on("git:clone-progress", listener);
      return () => electron.ipcRenderer.removeListener("git:clone-progress", listener);
    },
    scanForRepos: (rootPath, maxDepth) =>
      electron.ipcRenderer.invoke("git:scanForRepos", rootPath, maxDepth),
  },
  // GitHub APIs
  github: {
    validate: (token) => electron.ipcRenderer.invoke("github:validate", token),
    listRepos: () => electron.ipcRenderer.invoke("github:listRepos"),
    searchRepos: (query) => electron.ipcRenderer.invoke("github:searchRepos", query),
  },
  // Linear APIs
  linear: {
    validate: (apiKey) => electron.ipcRenderer.invoke("linear:validate", apiKey),
    listTeams: () => electron.ipcRenderer.invoke("linear:listTeams"),
    getTeamIssues: (teamId) => electron.ipcRenderer.invoke("linear:getTeamIssues", teamId),
    updateIssueState: (issueId, stateId) =>
      electron.ipcRenderer.invoke("linear:updateIssueState", issueId, stateId),
  },
  // iOS Simulator APIs
  simulator: {
    listWindows: () => electron.ipcRenderer.invoke("simulator:list-windows"),
    hasScreenPermission: () => electron.ipcRenderer.invoke("simulator:has-screen-permission"),
    requestScreenPermission: () =>
      electron.ipcRenderer.invoke("simulator:request-screen-permission"),
    hasAccessibilityPermission: () =>
      electron.ipcRenderer.invoke("simulator:has-accessibility-permission"),
    requestAccessibilityPermission: () =>
      electron.ipcRenderer.invoke("simulator:request-accessibility-permission"),
    startCapture: (windowId, config) =>
      electron.ipcRenderer.invoke("simulator:start-capture", windowId, config),
    stopCapture: (windowId) => electron.ipcRenderer.invoke("simulator:stop-capture", windowId),
    injectTap: (windowId, x, y) =>
      electron.ipcRenderer.invoke("simulator:inject-tap", windowId, x, y),
    injectSwipe: (windowId, startX, startY, endX, endY, durationMs) =>
      electron.ipcRenderer.invoke(
        "simulator:inject-swipe",
        windowId,
        startX,
        startY,
        endX,
        endY,
        durationMs,
      ),
    injectText: (windowId, text) =>
      electron.ipcRenderer.invoke("simulator:inject-text", windowId, text),
    onFrame: (callback) => {
      const listener = (_, windowId, frame) => callback(windowId, frame);
      electron.ipcRenderer.on("simulator:frame", listener);
      return () => electron.ipcRenderer.removeListener("simulator:frame", listener);
    },
    onError: (callback) => {
      const listener = (_, windowId, error) => callback(windowId, error);
      electron.ipcRenderer.on("simulator:error", listener);
      return () => electron.ipcRenderer.removeListener("simulator:error", listener);
    },
  },
  // Terminal APIs
  terminal: {
    // Create new terminal or reattach to existing one (for HMR persistence)
    create: (cwd, cols, rows, existingId) =>
      electron.ipcRenderer.invoke("terminal:create", cwd, cols, rows, existingId),
    write: (id, data) => electron.ipcRenderer.invoke("terminal:write", id, data),
    resize: (id, cols, rows) => electron.ipcRenderer.invoke("terminal:resize", id, cols, rows),
    kill: (id) => electron.ipcRenderer.invoke("terminal:kill", id),
    // Detach without killing (for HMR - keeps PTY alive)
    detach: (id) => electron.ipcRenderer.invoke("terminal:detach", id),
    // Check if terminal still exists in main process
    exists: (id) => electron.ipcRenderer.invoke("terminal:exists", id),
    onData: (callback) => {
      const listener = (_, id, data) => callback(id, data);
      electron.ipcRenderer.on("terminal:data", listener);
      return () => electron.ipcRenderer.removeListener("terminal:data", listener);
    },
    onExit: (callback) => {
      const listener = (_, id, code) => callback(id, code);
      electron.ipcRenderer.on("terminal:exit", listener);
      return () => electron.ipcRenderer.removeListener("terminal:exit", listener);
    },
    // Managed terminal methods (for AI agent control)
    createManaged: (cwd) => electron.ipcRenderer.invoke("terminal:createManaged", cwd),
    execManaged: (id, command, timeoutMs) =>
      electron.ipcRenderer.invoke("terminal:execManaged", id, command, timeoutMs),
    readManaged: (id, since, maxBytes) =>
      electron.ipcRenderer.invoke("terminal:readManaged", id, since, maxBytes),
    closeManaged: (id, force) => electron.ipcRenderer.invoke("terminal:closeManaged", id, force),
    isManaged: (id) => electron.ipcRenderer.invoke("terminal:isManaged", id),
    listManaged: () => electron.ipcRenderer.invoke("terminal:listManaged"),
    onManagedOutput: (callback) => {
      const listener = (_, data) => callback(data);
      electron.ipcRenderer.on("terminal:managed-output", listener);
      return () => electron.ipcRenderer.removeListener("terminal:managed-output", listener);
    },
    copyManaged: (id) => electron.ipcRenderer.invoke("terminal:copyManaged", id),
  },
  // Browser panel APIs (multi-tab support)
  browser: {
    // Initialize browser panel, returns initial tab ID
    create: (bounds) => electron.ipcRenderer.invoke("browser:create", bounds),
    // Destroy all tabs
    destroy: () => electron.ipcRenderer.invoke("browser:destroy"),
    // Update bounds for active tab
    setBounds: (bounds) => electron.ipcRenderer.invoke("browser:set-bounds", bounds),
    // Navigate active tab (or specific tab)
    navigate: (url, tabId) => electron.ipcRenderer.invoke("browser:navigate", url, tabId),
    // Execute CDP command on active tab (or specific tab)
    cdp: (method, params, tabId) =>
      electron.ipcRenderer.invoke("browser:cdp", method, params, tabId),
    // Open DevTools for active tab (or specific tab)
    openDevTools: (tabId) => electron.ipcRenderer.invoke("browser:devtools", tabId),
    // Get CDP URL for active tab (or specific tab)
    getCdpUrl: (tabId) => electron.ipcRenderer.invoke("browser:get-cdp-url", tabId),
    // Focus active tab
    focus: () => electron.ipcRenderer.invoke("browser:focus"),
    // Tab management
    createTab: (url) => electron.ipcRenderer.invoke("browser:create-tab", url),
    closeTab: (tabId) => electron.ipcRenderer.invoke("browser:close-tab", tabId),
    switchTab: (tabId) => electron.ipcRenderer.invoke("browser:switch-tab", tabId),
    listTabs: () => electron.ipcRenderer.invoke("browser:list-tabs"),
    getTab: (tabId) => electron.ipcRenderer.invoke("browser:get-tab", tabId),
    getActiveTab: () => electron.ipcRenderer.invoke("browser:get-active-tab"),
  },
};
if (process.contextIsolated) {
  try {
    electron.contextBridge.exposeInMainWorld("electron", preload.electronAPI);
    electron.contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.electron = preload.electronAPI;
  window.api = api;
}
