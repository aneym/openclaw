"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if ((from && typeof from === "object") || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, {
          get: () => from[key],
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable,
        });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (
  (target = mod != null ? __create(__getProtoOf(mod)) : {}),
  __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule
      ? __defProp(target, "default", { value: mod, enumerable: true })
      : target,
    mod,
  )
);
const utils = require("@electron-toolkit/utils");
const electron = require("electron");
const liquidGlass = require("electron-liquid-glass");
const fs = require("fs");
const os = require("os");
const path = require("path");
const child_process = require("child_process");
const crypto = require("crypto");
const pty = require("node-pty");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(
          n,
          k,
          d.get
            ? d
            : {
                enumerable: true,
                get: () => e[k],
              },
        );
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const pty__namespace = /* @__PURE__ */ _interopNamespaceDefault(pty);
const icon = path.join(__dirname, "../../resources/icon.png");
const tabs = /* @__PURE__ */ new Map();
let activeTabId = null;
let mainWindow = null;
let currentBounds = null;
function generateTabId() {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function createBrowserView() {
  return new electron.BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      javascript: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      plugins: true,
      // Persist cookies, localStorage, auth across app restarts
      partition: "persist:kos-browser",
    },
  });
}
function getActiveView() {
  if (!activeTabId) return null;
  return tabs.get(activeTabId)?.view ?? null;
}
function showTab(tabId) {
  if (!mainWindow || !currentBounds) return;
  for (const tab2 of tabs.values()) {
    tab2.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  }
  const tab = tabs.get(tabId);
  if (tab) {
    tab.view.setBounds(currentBounds);
    tab.view.webContents.focus();
    activeTabId = tabId;
  }
}
function getTabInfo(tab) {
  return {
    id: tab.id,
    url: tab.view.webContents.getURL() || tab.url,
    title: tab.view.webContents.getTitle() || tab.title || "New Tab",
    active: tab.id === activeTabId,
  };
}
function initBrowserPanel(window) {
  mainWindow = window;
  electron.ipcMain.handle("browser:create", (_, bounds) => {
    currentBounds = bounds;
    if (tabs.size === 0) {
      const id = generateTabId();
      const view = createBrowserView();
      mainWindow.addBrowserView(view);
      view.setBounds(bounds);
      view.setAutoResize({ width: true, height: true });
      view.webContents.debugger.attach("1.3");
      view.webContents.loadURL("about:blank");
      view.webContents.focus();
      tabs.set(id, { id, view, url: "about:blank", title: "New Tab" });
      activeTabId = id;
      return id;
    }
    if (activeTabId) {
      showTab(activeTabId);
    }
    return activeTabId;
  });
  electron.ipcMain.handle("browser:create-tab", (_, url) => {
    if (!mainWindow || !currentBounds) throw new Error("Browser not initialized");
    const id = generateTabId();
    const view = createBrowserView();
    mainWindow.addBrowserView(view);
    view.setAutoResize({ width: true, height: true });
    view.webContents.debugger.attach("1.3");
    const targetUrl = url || "about:blank";
    view.webContents.loadURL(targetUrl);
    tabs.set(id, { id, view, url: targetUrl, title: "New Tab" });
    showTab(id);
    return id;
  });
  electron.ipcMain.handle("browser:close-tab", (_, tabId) => {
    const tab = tabs.get(tabId);
    if (!tab || !mainWindow) return false;
    try {
      tab.view.webContents.debugger.detach();
    } catch {}
    mainWindow.removeBrowserView(tab.view);
    tabs.delete(tabId);
    if (activeTabId === tabId) {
      const remaining = Array.from(tabs.keys());
      if (remaining.length > 0) {
        showTab(remaining[0]);
      } else {
        activeTabId = null;
      }
    }
    return true;
  });
  electron.ipcMain.handle("browser:switch-tab", (_, tabId) => {
    if (!tabs.has(tabId)) return false;
    showTab(tabId);
    return true;
  });
  electron.ipcMain.handle("browser:list-tabs", () => {
    return Array.from(tabs.values()).map(getTabInfo);
  });
  electron.ipcMain.handle("browser:focus", () => {
    getActiveView()?.webContents.focus();
  });
  electron.ipcMain.handle("browser:destroy", () => {
    if (!mainWindow) return;
    for (const tab of tabs.values()) {
      try {
        tab.view.webContents.debugger.detach();
      } catch {}
      mainWindow.removeBrowserView(tab.view);
    }
    tabs.clear();
    activeTabId = null;
  });
  electron.ipcMain.handle("browser:set-bounds", (_, bounds) => {
    currentBounds = bounds;
    if (activeTabId) {
      showTab(activeTabId);
    }
  });
  electron.ipcMain.handle("browser:navigate", (_, url, tabId) => {
    const targetId = tabId || activeTabId;
    if (!targetId) return;
    const tab = tabs.get(targetId);
    if (tab) {
      tab.url = url;
      tab.view.webContents.loadURL(url);
    }
  });
  electron.ipcMain.handle("browser:cdp", async (_, method, params, tabId) => {
    const targetId = tabId || activeTabId;
    if (!targetId) throw new Error("No active tab");
    const tab = tabs.get(targetId);
    if (!tab) throw new Error("Tab not found");
    return tab.view.webContents.debugger.sendCommand(method, params);
  });
  electron.ipcMain.handle("browser:devtools", (_, tabId) => {
    const targetId = tabId || activeTabId;
    if (!targetId) return;
    tabs.get(targetId)?.view.webContents.openDevTools({ mode: "detach" });
  });
  electron.ipcMain.handle("browser:get-cdp-url", async (_, tabId) => {
    const targetId = tabId || activeTabId;
    if (!targetId) return null;
    const tab = tabs.get(targetId);
    if (!tab) return null;
    try {
      const response = await fetch("http://localhost:9222/json");
      const targets = await response.json();
      const currentUrl = tab.view.webContents.getURL();
      const target = targets.find(
        (t) => t.type === "page" && t.url === currentUrl && t.webSocketDebuggerUrl,
      );
      if (target?.webSocketDebuggerUrl) {
        return target.webSocketDebuggerUrl;
      }
      const pageTargets = targets.filter(
        (t) =>
          t.type === "page" &&
          t.webSocketDebuggerUrl &&
          !t.url.startsWith("file://") &&
          !t.url.startsWith("app://"),
      );
      return pageTargets[0]?.webSocketDebuggerUrl ?? null;
    } catch {
      return null;
    }
  });
  electron.ipcMain.handle("browser:get-tab", (_, tabId) => {
    const tab = tabs.get(tabId);
    if (!tab) return null;
    return getTabInfo(tab);
  });
  electron.ipcMain.handle("browser:get-active-tab", () => {
    return activeTabId;
  });
}
const KOS_DIR = path.join(os.homedir(), ".kos");
const GLOBAL_CONFIG_PATH = path.join(KOS_DIR, "config.json");
const GITHUB_CONFIG_PATH = path.join(KOS_DIR, "github.json");
const LINEAR_CONFIG_PATH = path.join(KOS_DIR, "linear.json");
const THEMES_CONFIG_PATH = path.join(KOS_DIR, "themes.json");
const DEFAULT_THEMES_CONFIG = {
  version: 1,
  themes: [],
  activeThemeId: "twitter",
  mode: "dark",
};
const DEFAULT_GLOBAL_CONFIG = {
  version: 1,
  defaultGatewayUrl: "ws://localhost:18789",
  theme: "system",
  sidebarWidth: 280,
};
function ensureKosDir() {
  if (!fs.existsSync(KOS_DIR)) {
    fs.mkdirSync(KOS_DIR, { recursive: true });
  }
}
function readJsonFile(path2) {
  try {
    if (!fs.existsSync(path2)) return null;
    const raw = fs.readFileSync(path2, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function writeJsonFile(path2, data) {
  ensureKosDir();
  fs.writeFileSync(path2, JSON.stringify(data, null, 2), "utf-8");
}
function deleteFile(path2) {
  try {
    if (fs.existsSync(path2)) {
      fs.unlinkSync(path2);
    }
  } catch {}
}
function getGlobalConfig() {
  const config = readJsonFile(GLOBAL_CONFIG_PATH);
  return config ?? DEFAULT_GLOBAL_CONFIG;
}
function saveGlobalConfig(config) {
  writeJsonFile(GLOBAL_CONFIG_PATH, config);
}
function getGitHubConfig() {
  return readJsonFile(GITHUB_CONFIG_PATH);
}
function saveGitHubConfig(config) {
  writeJsonFile(GITHUB_CONFIG_PATH, config);
}
function clearGitHubConfig() {
  deleteFile(GITHUB_CONFIG_PATH);
}
function getLinearConfig() {
  return readJsonFile(LINEAR_CONFIG_PATH);
}
function saveLinearConfig(config) {
  writeJsonFile(LINEAR_CONFIG_PATH, config);
}
function clearLinearConfig() {
  deleteFile(LINEAR_CONFIG_PATH);
}
function getThemesConfig() {
  const config = readJsonFile(THEMES_CONFIG_PATH);
  return config ?? DEFAULT_THEMES_CONFIG;
}
function saveThemesConfig(config) {
  writeJsonFile(THEMES_CONFIG_PATH, config);
}
function getKosDir() {
  ensureKosDir();
  return KOS_DIR;
}
function registerConfigIpc() {
  electron.ipcMain.handle("config:getGlobal", () => {
    return getGlobalConfig();
  });
  electron.ipcMain.handle("config:saveGlobal", (_, config) => {
    saveGlobalConfig(config);
  });
  electron.ipcMain.handle("config:getGitHub", () => {
    return getGitHubConfig();
  });
  electron.ipcMain.handle("config:saveGitHub", (_, config) => {
    saveGitHubConfig(config);
  });
  electron.ipcMain.handle("config:clearGitHub", () => {
    clearGitHubConfig();
  });
  electron.ipcMain.handle("config:getLinear", () => {
    return getLinearConfig();
  });
  electron.ipcMain.handle("config:saveLinear", (_, config) => {
    saveLinearConfig(config);
  });
  electron.ipcMain.handle("config:clearLinear", () => {
    clearLinearConfig();
  });
  electron.ipcMain.on("config:getThemesSync", (event) => {
    event.returnValue = getThemesConfig();
  });
  electron.ipcMain.handle("config:getThemes", () => {
    return getThemesConfig();
  });
  electron.ipcMain.handle("config:saveThemes", (_, config) => {
    saveThemesConfig(config);
  });
}
function runGit(args, cwd) {
  try {
    return child_process
      .execSync(`git ${args.join(" ")}`, {
        cwd,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      })
      .trim();
  } catch (err) {
    const error = err;
    throw new Error(error.stderr || error.message || "Git command failed");
  }
}
function isGitRepo(path2) {
  if (!fs.existsSync(path2)) return false;
  try {
    runGit(["rev-parse", "--git-dir"], path2);
    return true;
  } catch {
    return false;
  }
}
function getRepoInfo(path2) {
  if (!isGitRepo(path2)) {
    return {};
  }
  const info = {};
  try {
    info.remoteUrl = runGit(["config", "--get", "remote.origin.url"], path2);
  } catch {}
  try {
    const remoteHead = runGit(["symbolic-ref", "refs/remotes/origin/HEAD"], path2);
    info.defaultBranch = remoteHead.replace("refs/remotes/origin/", "");
  } catch {
    try {
      const branches = runGit(["branch", "-a"], path2);
      if (branches.includes("main")) {
        info.defaultBranch = "main";
      } else if (branches.includes("master")) {
        info.defaultBranch = "master";
      }
    } catch {}
  }
  try {
    info.currentBranch = runGit(["branch", "--show-current"], path2);
  } catch {}
  return info;
}
function listWorktrees(repoPath) {
  if (!isGitRepo(repoPath)) {
    return [];
  }
  try {
    const output = runGit(["worktree", "list", "--porcelain"], repoPath);
    const worktrees = [];
    let current = {};
    for (const line of output.split("\n")) {
      if (line.startsWith("worktree ")) {
        if (current.path) {
          worktrees.push(current);
        }
        current = { path: line.slice(9), isMain: false, isPrunable: false };
      } else if (line.startsWith("HEAD ")) {
        current.commit = line.slice(5);
      } else if (line.startsWith("branch ")) {
        current.branch = line.slice(7).replace("refs/heads/", "");
      } else if (line === "bare") {
        current.isMain = true;
      } else if (line === "prunable") {
        current.isPrunable = true;
      } else if (line === "") {
      }
    }
    if (current.path) {
      if (worktrees.length === 0) {
        current.isMain = true;
      }
      worktrees.push(current);
    }
    return worktrees;
  } catch {
    return [];
  }
}
function createWorktree(repoPath, branch, targetPath) {
  if (!isGitRepo(repoPath)) {
    throw new Error("Not a git repository");
  }
  try {
    runGit(["rev-parse", "--verify", branch], repoPath);
    runGit(["worktree", "add", targetPath, branch], repoPath);
  } catch {
    runGit(["worktree", "add", "-b", branch, targetPath], repoPath);
  }
}
function removeWorktree(worktreePath) {
  const gitDir = path.join(worktreePath, ".git");
  if (!fs.existsSync(gitDir)) {
    throw new Error("Not a valid worktree path");
  }
  child_process.execSync(`git worktree remove "${worktreePath}"`, {
    cwd: worktreePath,
    encoding: "utf-8",
  });
}
function listBranches(repoPath) {
  if (!isGitRepo(repoPath)) {
    return { local: [], remote: [] };
  }
  const result = { local: [], remote: [] };
  try {
    const localOutput = runGit(["branch", "--format=%(refname:short)"], repoPath);
    result.local = localOutput.split("\n").filter(Boolean);
  } catch {}
  try {
    const remoteOutput = runGit(["branch", "-r", "--format=%(refname:short)"], repoPath);
    result.remote = remoteOutput
      .split("\n")
      .filter(Boolean)
      .map((b) => b.replace("origin/", ""))
      .filter((b) => b !== "HEAD");
  } catch {}
  return result;
}
function getRepoStatus(repoPath) {
  const status = { ahead: 0, behind: 0, dirty: false };
  if (!isGitRepo(repoPath)) {
    return status;
  }
  try {
    const dirtyCheck = runGit(["status", "--porcelain"], repoPath);
    status.dirty = dirtyCheck.length > 0;
  } catch {}
  try {
    const currentBranch = runGit(["branch", "--show-current"], repoPath);
    if (currentBranch) {
      const tracking = runGit(
        ["rev-list", "--left-right", "--count", `${currentBranch}...origin/${currentBranch}`],
        repoPath,
      );
      const [ahead, behind] = tracking.split("	").map(Number);
      status.ahead = ahead || 0;
      status.behind = behind || 0;
    }
  } catch {}
  return status;
}
function pull(repoPath) {
  if (!isGitRepo(repoPath)) {
    return { success: false, error: "Not a git repository" };
  }
  try {
    runGit(["pull"], repoPath);
    return { success: true };
  } catch (err) {
    const error = err;
    return { success: false, error: error.message };
  }
}
function push(repoPath) {
  if (!isGitRepo(repoPath)) {
    return { success: false, error: "Not a git repository" };
  }
  try {
    runGit(["push"], repoPath);
    return { success: true };
  } catch (err) {
    const error = err;
    return { success: false, error: error.message };
  }
}
function clone(url, targetPath, onProgress) {
  return new Promise((resolve, reject) => {
    const args = ["clone", "--progress", url, targetPath];
    const proc = child_process.spawn("git", args);
    let stderr = "";
    proc.stderr.on("data", (data) => {
      const text = data.toString();
      stderr += text;
      if (onProgress) {
        onProgress(text.trim());
      }
    });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Clone failed: ${stderr}`));
      }
    });
    proc.on("error", (err) => {
      reject(err);
    });
  });
}
function getRepoDisplayName(path$1) {
  return path.basename(path$1);
}
const SKIP_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  "vendor",
  "Pods",
  ".bundle",
  "build",
  "dist",
  ".next",
  ".nuxt",
  ".output",
  "__pycache__",
  ".venv",
  "venv",
]);
function scanForGitRepos(rootPath, maxDepth = 3) {
  const discovered = [];
  function scan(currentPath, depth) {
    if (depth > maxDepth) return;
    const gitPath = path.join(currentPath, ".git");
    if (fs.existsSync(gitPath)) {
      const info = getRepoInfo(currentPath);
      discovered.push({
        path: currentPath,
        name: path.basename(currentPath),
        remoteUrl: info.remoteUrl,
        defaultBranch: info.defaultBranch,
      });
      return;
    }
    let entries;
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".") && depth > 0) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      scan(path.join(currentPath, entry.name), depth + 1);
    }
  }
  scan(rootPath, 0);
  return discovered;
}
function registerGitIpc() {
  electron.ipcMain.handle("git:isRepo", (_, path2) => {
    return isGitRepo(path2);
  });
  electron.ipcMain.handle("git:getRepoInfo", (_, path2) => {
    return getRepoInfo(path2);
  });
  electron.ipcMain.handle("git:listWorktrees", (_, path2) => {
    return listWorktrees(path2);
  });
  electron.ipcMain.handle("git:createWorktree", (_, repoPath, branch, targetPath) => {
    createWorktree(repoPath, branch, targetPath);
  });
  electron.ipcMain.handle("git:removeWorktree", (_, path2) => {
    removeWorktree(path2);
  });
  electron.ipcMain.handle("git:listBranches", (_, path2) => {
    return listBranches(path2);
  });
  electron.ipcMain.handle("git:getStatus", (_, path2) => {
    return getRepoStatus(path2);
  });
  electron.ipcMain.handle("git:pull", (_, path2) => {
    return pull(path2);
  });
  electron.ipcMain.handle("git:push", (_, path2) => {
    return push(path2);
  });
  electron.ipcMain.handle("git:clone", async (event, url, targetPath) => {
    const win = electron.BrowserWindow.fromWebContents(event.sender);
    await clone(url, targetPath, (message) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send("git:clone-progress", message);
      }
    });
  });
  electron.ipcMain.handle("git:getDisplayName", (_, path2) => {
    return getRepoDisplayName(path2);
  });
  electron.ipcMain.handle("git:scanForRepos", (_, rootPath, maxDepth) => {
    return scanForGitRepos(rootPath, maxDepth);
  });
}
const GITHUB_API = "https://api.github.com";
async function githubFetch(endpoint, token, options) {
  const response = await fetch(`${GITHUB_API}${endpoint}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...options?.headers,
    },
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub API error: ${response.status} - ${error}`);
  }
  return response.json();
}
async function validateToken(token) {
  try {
    const user = await githubFetch("/user", token);
    return {
      valid: true,
      username: user.login,
    };
  } catch (err) {
    const error = err;
    return {
      valid: false,
      error: error.message,
    };
  }
}
async function listUserRepos(token) {
  const actualToken = getGitHubConfig()?.token;
  if (!actualToken) {
    throw new Error("GitHub not connected");
  }
  const repos = await githubFetch(
    "/user/repos?per_page=100&sort=updated&direction=desc",
    actualToken,
  );
  return repos.map((repo) => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    cloneUrl: repo.clone_url,
    sshUrl: repo.ssh_url,
    private: repo.private,
    defaultBranch: repo.default_branch,
  }));
}
async function searchRepos(query, token) {
  const actualToken = getGitHubConfig()?.token;
  if (!actualToken) {
    throw new Error("GitHub not connected");
  }
  const result = await githubFetch(
    `/search/repositories?q=${encodeURIComponent(query)}&per_page=20&sort=updated`,
    actualToken,
  );
  return result.items.map((repo) => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    cloneUrl: repo.clone_url,
    sshUrl: repo.ssh_url,
    private: repo.private,
    defaultBranch: repo.default_branch,
  }));
}
function registerGitHubIpc() {
  electron.ipcMain.handle("github:validate", (_, token) => {
    return validateToken(token);
  });
  electron.ipcMain.handle("github:listRepos", () => {
    return listUserRepos();
  });
  electron.ipcMain.handle("github:searchRepos", (_, query) => {
    return searchRepos(query);
  });
}
const LINEAR_API = "https://api.linear.app/graphql";
async function linearQuery(query, variables, apiKey) {
  const actualKey = apiKey ?? getLinearConfig()?.apiKey;
  if (!actualKey) {
    throw new Error("Linear not connected");
  }
  const response = await fetch(LINEAR_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: actualKey,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Linear API error: ${response.status} - ${error}`);
  }
  const result = await response.json();
  if (result.errors && result.errors.length > 0) {
    throw new Error(`Linear API error: ${result.errors[0].message}`);
  }
  return result.data;
}
async function validateApiKey(apiKey) {
  try {
    const query = `
      query {
        viewer {
          id
          name
          displayName
          avatarUrl
        }
      }
    `;
    const result = await linearQuery(query, {}, apiKey);
    return {
      valid: true,
      user: result.viewer,
    };
  } catch (err) {
    const error = err;
    return {
      valid: false,
      error: error.message,
    };
  }
}
async function listTeams(apiKey) {
  const query = `
    query {
      teams {
        nodes {
          id
          name
          key
          states {
            nodes {
              id
              name
              color
              position
              type
            }
          }
        }
      }
    }
  `;
  const result = await linearQuery(query, {}, apiKey);
  return result.teams.nodes.map((team) => ({
    id: team.id,
    name: team.name,
    key: team.key,
    states: team.states.nodes
      .map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        position: s.position,
        type: s.type,
      }))
      .sort((a, b) => a.position - b.position),
  }));
}
async function getTeamIssues(teamId, apiKey) {
  const query = `
    query($teamId: String!) {
      team(id: $teamId) {
        issues(
          first: 50
          filter: {
            state: { type: { nin: ["completed", "canceled"] } }
          }
        ) {
          nodes {
            id
            identifier
            title
            priority
            state {
              id
              name
              color
              position
              type
            }
            assignee {
              id
              name
              displayName
              avatarUrl
            }
            labels(first: 5) {
              nodes {
                id
                name
                color
              }
            }
            relations(first: 10) {
              nodes {
                type
                relatedIssue {
                  id
                  identifier
                  title
                  state {
                    name
                    type
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
  const result = await linearQuery(query, { teamId }, apiKey);
  const issues = result.team.issues.nodes.map((issue) => {
    const relations = issue.relations.nodes.map((r) => ({
      type: r.type,
      relatedIssue: {
        id: r.relatedIssue.id,
        identifier: r.relatedIssue.identifier,
        title: r.relatedIssue.title,
        state: {
          name: r.relatedIssue.state.name,
          type: r.relatedIssue.state.type,
        },
      },
    }));
    const isBlocked = relations.some(
      (r) =>
        r.type === "is_blocked_by" &&
        r.relatedIssue.state.type !== "completed" &&
        r.relatedIssue.state.type !== "canceled",
    );
    const downstreamCount = relations.filter((r) => r.type === "blocks").length;
    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
      priority: issue.priority,
      state: {
        id: issue.state.id,
        name: issue.state.name,
        color: issue.state.color,
        position: issue.state.position,
        type: issue.state.type,
      },
      assignee: issue.assignee
        ? {
            id: issue.assignee.id,
            name: issue.assignee.name,
            displayName: issue.assignee.displayName,
            avatarUrl: issue.assignee.avatarUrl,
          }
        : void 0,
      labels: issue.labels.nodes.map((l) => ({
        id: l.id,
        name: l.name,
        color: l.color,
      })),
      relations,
      isBlocked,
      downstreamCount,
    };
  });
  return issues;
}
async function updateIssueState(issueId, stateId, apiKey) {
  const mutation = `
    mutation($issueId: String!, $stateId: String!) {
      issueUpdate(id: $issueId, input: { stateId: $stateId }) {
        success
        issue {
          id
          state {
            name
          }
        }
      }
    }
  `;
  await linearQuery(mutation, { issueId, stateId }, apiKey);
}
function registerLinearIpc() {
  electron.ipcMain.handle("linear:validate", (_, apiKey) => {
    return validateApiKey(apiKey);
  });
  electron.ipcMain.handle("linear:listTeams", () => {
    return listTeams();
  });
  electron.ipcMain.handle("linear:getTeamIssues", (_, teamId) => {
    return getTeamIssues(teamId);
  });
  electron.ipcMain.handle("linear:updateIssueState", (_, issueId, stateId) => {
    return updateIssueState(issueId, stateId);
  });
}
function getProjectsDir() {
  const kosDir = getKosDir();
  const projectsDir = path.join(kosDir, "projects");
  if (!fs.existsSync(projectsDir)) {
    fs.mkdirSync(projectsDir, { recursive: true });
  }
  return projectsDir;
}
function getProjectDir(projectId) {
  return path.join(getProjectsDir(), projectId);
}
function getProjectConfigPath(projectId) {
  return path.join(getProjectDir(projectId), "config.json");
}
function listProjects() {
  const projectsDir = getProjectsDir();
  try {
    const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
    const projects = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const projectId = entry.name;
      const configPath = getProjectConfigPath(projectId);
      if (!fs.existsSync(configPath)) continue;
      try {
        const raw = fs.readFileSync(configPath, "utf-8");
        const configFile = JSON.parse(raw);
        projects.push({
          id: projectId,
          ...configFile.project,
        });
      } catch {
        continue;
      }
    }
    return projects.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}
function getProject(id) {
  const configPath = getProjectConfigPath(id);
  if (!fs.existsSync(configPath)) return null;
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const configFile = JSON.parse(raw);
    return {
      id,
      ...configFile.project,
    };
  } catch {
    return null;
  }
}
function saveProject(project) {
  const projectDir = getProjectDir(project.id);
  const configPath = getProjectConfigPath(project.id);
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }
  const { id, ...projectData } = project;
  const configFile = {
    version: 1,
    project: projectData,
  };
  fs.writeFileSync(configPath, JSON.stringify(configFile, null, 2), "utf-8");
}
function deleteProject(id) {
  const projectDir = getProjectDir(id);
  if (fs.existsSync(projectDir)) {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
}
function generateProjectId() {
  return `proj-${crypto.randomUUID().slice(0, 8)}`;
}
function registerProjectIpc() {
  electron.ipcMain.handle("projects:list", () => {
    return listProjects();
  });
  electron.ipcMain.handle("projects:get", (_, id) => {
    return getProject(id);
  });
  electron.ipcMain.handle("projects:save", (_, project) => {
    saveProject(project);
  });
  electron.ipcMain.handle("projects:delete", (_, id) => {
    deleteProject(id);
  });
  electron.ipcMain.handle("projects:generateId", () => {
    return generateProjectId();
  });
}
const SCROLLBACK_DIR = path.join(os.homedir(), ".kos", "terminals");
function ensureScrollbackDir() {
  if (!fs.existsSync(SCROLLBACK_DIR)) {
    fs.mkdirSync(SCROLLBACK_DIR, { recursive: true });
  }
}
function getScrollbackPath(terminalId) {
  const safeId = terminalId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(SCROLLBACK_DIR, `${safeId}.scrollback`);
}
function saveScrollback(terminalId, scrollback) {
  try {
    ensureScrollbackDir();
    const data = scrollback.join("");
    fs.writeFileSync(getScrollbackPath(terminalId), data, "utf-8");
  } catch (err) {
    console.error(`[terminal-service] Failed to save scrollback for ${terminalId}:`, err);
  }
}
function loadScrollback(terminalId) {
  try {
    const path2 = getScrollbackPath(terminalId);
    if (fs.existsSync(path2)) {
      return fs.readFileSync(path2, "utf-8");
    }
  } catch (err) {
    console.error(`[terminal-service] Failed to load scrollback for ${terminalId}:`, err);
  }
  return null;
}
function deleteScrollback(terminalId) {
  try {
    const path2 = getScrollbackPath(terminalId);
    if (fs.existsSync(path2)) {
      fs.unlinkSync(path2);
    }
  } catch {}
}
function cleanupOldScrollback() {
  try {
    ensureScrollbackDir();
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1e3;
    const files = fs.readdirSync(SCROLLBACK_DIR);
    for (const file of files) {
      if (!file.endsWith(".scrollback")) continue;
      const filePath = path.join(SCROLLBACK_DIR, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > maxAge) {
        fs.unlinkSync(filePath);
        console.log(`[terminal-service] Cleaned up old scrollback: ${file}`);
      }
    }
  } catch (err) {
    console.error("[terminal-service] Failed to cleanup old scrollback:", err);
  }
}
const MAX_SCROLLBACK_BYTES = 500 * 1024;
const terminals = /* @__PURE__ */ new Map();
function generateId() {
  return `term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function getDefaultShell() {
  if (process.platform === "darwin" || process.platform === "linux") {
    const envShell = process.env.SHELL;
    if (envShell && fs.existsSync(envShell)) {
      return envShell;
    }
    const fallbackShells = ["/bin/zsh", "/bin/bash", "/bin/sh"];
    for (const shell of fallbackShells) {
      if (fs.existsSync(shell)) {
        return shell;
      }
    }
    return "/bin/sh";
  }
  return process.env.COMSPEC || "cmd.exe";
}
function createTerminal(cwd, cols, rows, onData, onExit, existingId) {
  if (existingId) {
    const existing = terminals.get(existingId);
    if (existing) {
      console.log(
        `[terminal-service] ✅ REATTACH to existing terminal: id=${existingId}, pid=${existing.pty.pid}, scrollback=${existing.scrollbackBytes} bytes`,
      );
      existing.onData = onData;
      existing.onExit = onExit;
      existing.pty.resize(Math.max(cols, 1), Math.max(rows, 1));
      if (existing.scrollback.length > 0) {
        const scrollbackData = existing.scrollback.join("");
        setImmediate(() => {
          existing.onData?.(scrollbackData);
        });
      }
      return {
        id: existingId,
        pid: existing.pty.pid,
        cwd: existing.cwd,
        cols: existing.pty.cols,
        rows: existing.pty.rows,
      };
    }
    console.log(`[terminal-service] 🆕 Terminal ${existingId} not found, will create new`);
  }
  const id = existingId || generateId();
  const shell = getDefaultShell();
  const effectiveCwd = cwd && fs.existsSync(cwd) ? cwd : os.homedir();
  console.log(
    `[terminal-service] Creating terminal: id=${id}, shell=${shell}, cwd=${effectiveCwd}, cols=${cols}, rows=${rows}`,
  );
  const ptyProcess = pty__namespace.spawn(shell, [], {
    name: "xterm-256color",
    cols: Math.max(cols, 1),
    rows: Math.max(rows, 1),
    cwd: effectiveCwd,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    },
  });
  console.log(`[terminal-service] Terminal created: id=${id}, pid=${ptyProcess.pid}`);
  const savedScrollback = loadScrollback(id);
  const initialScrollback = savedScrollback ? [savedScrollback] : [];
  const initialBytes = savedScrollback?.length ?? 0;
  const entry = {
    pty: ptyProcess,
    onData,
    onExit,
    cwd: effectiveCwd,
    scrollback: initialScrollback,
    scrollbackBytes: initialBytes,
    saveTimeout: null,
  };
  if (savedScrollback) {
    console.log(
      `[terminal-service] Loaded ${savedScrollback.length} bytes of saved scrollback for ${id}`,
    );
    setImmediate(() => {
      entry.onData?.(savedScrollback);
    });
  }
  ptyProcess.onData((data) => {
    entry.scrollback.push(data);
    entry.scrollbackBytes += data.length;
    while (entry.scrollbackBytes > MAX_SCROLLBACK_BYTES && entry.scrollback.length > 1) {
      const removed = entry.scrollback.shift();
      entry.scrollbackBytes -= removed.length;
    }
    if (entry.saveTimeout) clearTimeout(entry.saveTimeout);
    entry.saveTimeout = setTimeout(() => {
      saveScrollback(id, entry.scrollback);
    }, 5e3);
    entry.onData?.(data);
  });
  ptyProcess.onExit(({ exitCode }) => {
    if (entry.saveTimeout) clearTimeout(entry.saveTimeout);
    saveScrollback(id, entry.scrollback);
    const exitCallback = entry.onExit;
    terminals.delete(id);
    exitCallback?.(exitCode);
  });
  terminals.set(id, entry);
  return {
    id,
    pid: ptyProcess.pid,
    cwd: effectiveCwd,
    cols,
    rows,
  };
}
function detachTerminal(id) {
  const entry = terminals.get(id);
  if (entry) {
    console.log(
      `[terminal-service] 🔌 DETACH terminal: id=${id}, pid=${entry.pty.pid} (PTY stays alive)`,
    );
    entry.onData = null;
    entry.onExit = null;
    return true;
  }
  console.log(`[terminal-service] ⚠️ DETACH failed - terminal not found: id=${id}`);
  return false;
}
function hasTerminal(id) {
  return terminals.has(id);
}
function writeTerminal(id, data) {
  const entry = terminals.get(id);
  if (entry) {
    entry.pty.write(data);
  }
}
function resizeTerminal(id, cols, rows) {
  const entry = terminals.get(id);
  if (entry) {
    entry.pty.resize(cols, rows);
  }
}
function killTerminal(id, preserveScrollback = true) {
  const entry = terminals.get(id);
  if (entry) {
    if (entry.saveTimeout) clearTimeout(entry.saveTimeout);
    if (preserveScrollback) {
      saveScrollback(id, entry.scrollback);
    } else {
      deleteScrollback(id);
    }
    entry.pty.kill();
    terminals.delete(id);
  }
}
function clearTerminalScrollback(id) {
  const entry = terminals.get(id);
  if (entry) {
    entry.scrollback = [];
    entry.scrollbackBytes = 0;
    if (entry.saveTimeout) clearTimeout(entry.saveTimeout);
    deleteScrollback(id);
  }
}
function getTerminalInfo(id) {
  const entry = terminals.get(id);
  if (!entry) return null;
  return {
    id,
    pid: entry.pty.pid,
    cwd: entry.cwd,
    cols: entry.pty.cols,
    rows: entry.pty.rows,
  };
}
function killAllTerminals() {
  for (const [id, entry] of terminals) {
    if (entry.saveTimeout) clearTimeout(entry.saveTimeout);
    saveScrollback(id, entry.scrollback);
    entry.pty.kill();
    terminals.delete(id);
  }
}
function getTerminalChildProcesses(id) {
  const entry = terminals.get(id);
  if (!entry) return [];
  try {
    const { execSync } = require("child_process");
    const result = execSync(`pgrep -P ${entry.pty.pid} 2>/dev/null || true`, {
      encoding: "utf-8",
    }).trim();
    if (!result) return [];
    const childPids = result.split("\n").filter(Boolean);
    const names = [];
    for (const pid of childPids) {
      try {
        const name = execSync(`ps -p ${pid} -o comm= 2>/dev/null || true`, {
          encoding: "utf-8",
        }).trim();
        if (name) names.push(name);
      } catch {}
    }
    return names;
  } catch {
    return [];
  }
}
function getTerminalsWithProcesses() {
  const result = [];
  for (const [id, entry] of terminals) {
    const processes = getTerminalChildProcesses(id);
    if (processes.length > 0) {
      result.push({ id, pid: entry.pty.pid, processes });
    }
  }
  return result;
}
const managedTerminals = /* @__PURE__ */ new Map();
function createManagedTerminal(cwd, onOutput) {
  const id = `managed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const effectiveCwd = cwd && fs.existsSync(cwd) ? cwd : os.homedir();
  console.log(`[terminal-service] Creating managed terminal: id=${id}, cwd=${effectiveCwd}`);
  const info = createTerminal(
    effectiveCwd,
    80,
    24,
    onOutput,
    // Stream output back to renderer
    (code) => {
      console.log(`[terminal-service] Managed terminal exited: id=${id}, code=${code}`);
      managedTerminals.delete(id);
    },
    id,
  );
  managedTerminals.set(id, {
    cwd: effectiveCwd,
    createdAt: Date.now(),
  });
  return { id: info.id, pid: info.pid, managed: true };
}
async function execInManagedTerminal(id, command, timeoutMs = 3e4) {
  const entry = terminals.get(id);
  if (!entry) throw new Error(`Terminal ${id} not found`);
  if (!managedTerminals.has(id)) throw new Error(`Terminal ${id} is not managed`);
  return new Promise((resolve) => {
    let output = "";
    const originalOnData = entry.onData;
    entry.onData = (data) => {
      output += data;
      originalOnData?.(data);
    };
    entry.pty.write(command + "\n");
    const marker = `__OPENCLAW_EXEC_DONE_${Date.now()}__`;
    setTimeout(() => {
      entry.pty.write(`echo "${marker}"
`);
    }, 100);
    const checkInterval = setInterval(() => {
      if (output.includes(marker)) {
        clearInterval(checkInterval);
        clearTimeout(timer);
        entry.onData = originalOnData;
        const cleanOutput = output.split(marker)[0].replace(`echo "${marker}"`, "").trim();
        resolve({ output: cleanOutput });
      }
    }, 100);
    const timer = setTimeout(() => {
      clearInterval(checkInterval);
      entry.onData = originalOnData;
      resolve({ output });
    }, timeoutMs);
  });
}
function readManagedTerminalOutput(id, _since, maxBytes = 5e4) {
  const entry = terminals.get(id);
  if (!entry) throw new Error(`Terminal ${id} not found`);
  if (!managedTerminals.has(id)) throw new Error(`Terminal ${id} is not managed`);
  const fullOutput = entry.scrollback.join("");
  return fullOutput.slice(-maxBytes);
}
function closeManagedTerminal(id, force = false) {
  if (!managedTerminals.has(id)) throw new Error(`Terminal ${id} is not managed`);
  console.log(`[terminal-service] Closing managed terminal: id=${id}, force=${force}`);
  managedTerminals.delete(id);
  killTerminal(id, !force);
}
function isManagedTerminal(id) {
  return managedTerminals.has(id);
}
function listManagedTerminals() {
  const result = [];
  for (const [id, meta] of managedTerminals) {
    const entry = terminals.get(id);
    if (entry) {
      result.push({
        id,
        pid: entry.pty.pid,
        cwd: meta.cwd,
        createdAt: meta.createdAt,
      });
    }
  }
  return result;
}
function copyManagedTerminalOutput(id, maxBytes = 5e4) {
  const entry = terminals.get(id);
  if (!entry) throw new Error(`Terminal ${id} not found`);
  if (!managedTerminals.has(id)) throw new Error(`Terminal ${id} is not managed`);
  const fullOutput = entry.scrollback.join("");
  return fullOutput.slice(-maxBytes);
}
function registerTerminalIpc() {
  electron.ipcMain.handle("terminal:create", (event, cwd, cols, rows, existingId) => {
    const win = electron.BrowserWindow.fromWebContents(event.sender);
    const info = createTerminal(
      cwd,
      cols,
      rows,
      // onData callback - send data to renderer
      (data) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send("terminal:data", info.id, data);
        }
      },
      // onExit callback - notify renderer
      (code) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send("terminal:exit", info.id, code);
        }
      },
      existingId,
    );
    return { id: info.id, pid: info.pid };
  });
  electron.ipcMain.handle("terminal:detach", (_, id) => {
    return detachTerminal(id);
  });
  electron.ipcMain.handle("terminal:exists", (_, id) => {
    return hasTerminal(id);
  });
  electron.ipcMain.handle("terminal:write", (_, id, data) => {
    writeTerminal(id, data);
  });
  electron.ipcMain.handle("terminal:resize", (_, id, cols, rows) => {
    resizeTerminal(id, cols, rows);
  });
  electron.ipcMain.handle("terminal:kill", (_, id) => {
    killTerminal(id);
  });
  electron.ipcMain.handle("terminal:info", (_, id) => {
    return getTerminalInfo(id);
  });
  electron.ipcMain.handle("terminal:clearScrollback", (_, id) => {
    clearTerminalScrollback(id);
  });
  electron.ipcMain.handle("terminal:createManaged", async (event, cwd) => {
    const win = electron.BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error("No window");
    const onOutput = (data) => {
      if (!win.isDestroyed()) {
        win.webContents.send("terminal:managed-output", data);
      }
    };
    return createManagedTerminal(cwd, onOutput);
  });
  electron.ipcMain.handle("terminal:execManaged", async (_, id, command, timeoutMs) => {
    return execInManagedTerminal(id, command, timeoutMs);
  });
  electron.ipcMain.handle("terminal:readManaged", (_, id, since, maxBytes) => {
    return readManagedTerminalOutput(id, since, maxBytes);
  });
  electron.ipcMain.handle("terminal:closeManaged", (_, id, force) => {
    return closeManagedTerminal(id, force);
  });
  electron.ipcMain.handle("terminal:isManaged", (_, id) => {
    return isManagedTerminal(id);
  });
  electron.ipcMain.handle("terminal:listManaged", () => {
    return listManagedTerminals();
  });
  electron.ipcMain.handle("terminal:copyManaged", (_, id) => {
    const output = copyManagedTerminalOutput(id);
    electron.clipboard.writeText(output);
    return { copied: true, length: output.length };
  });
}
function cleanupTerminals() {
  killAllTerminals();
}
function registerAllIpc() {
  registerConfigIpc();
  registerProjectIpc();
  registerGitIpc();
  registerGitHubIpc();
  registerLinearIpc();
  registerTerminalIpc();
}
const MAX_BUFFER_SIZE = 500;
const buffer = [];
const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
};
const NOISE_PATTERNS = [
  /Terminal .* not found, will create new/,
  // Routine terminal creation
  /\[terminal-service\] Creating terminal/,
  // Routine
  /\[terminal-service\] Loaded .* scrollback/,
  // Routine
  /\[terminal-service\].*REATTACH/,
  // Routine HMR reattach
  /\[terminal-service\].*DETACH/,
  // Routine HMR detach
];
function isNoise(message) {
  return NOISE_PATTERNS.some((pattern) => pattern.test(message));
}
function formatArg(arg) {
  if (arg === void 0) return "undefined";
  if (arg === null) return "null";
  if (typeof arg === "string") return arg;
  if (typeof arg === "number" || typeof arg === "boolean") return String(arg);
  if (arg instanceof Error)
    return `${arg.name}: ${arg.message}
${arg.stack || ""}`;
  try {
    return JSON.stringify(arg, null, 2);
  } catch {
    return String(arg);
  }
}
function captureLog(level, args) {
  buffer.push({
    level,
    timestamp: Date.now(),
    args,
  });
  if (buffer.length > MAX_BUFFER_SIZE) {
    buffer.splice(0, buffer.length - MAX_BUFFER_SIZE);
  }
}
function installConsoleInterceptor() {
  console.log = (...args) => {
    captureLog("log", args);
    originalConsole.log(...args);
  };
  console.info = (...args) => {
    captureLog("info", args);
    originalConsole.info(...args);
  };
  console.warn = (...args) => {
    captureLog("warn", args);
    originalConsole.warn(...args);
  };
  console.error = (...args) => {
    captureLog("error", args);
    originalConsole.error(...args);
  };
  console.debug = (...args) => {
    captureLog("debug", args);
    originalConsole.debug(...args);
  };
}
function formatEntry(entry) {
  const time = new Date(entry.timestamp).toISOString();
  const level = entry.level.toUpperCase().padEnd(5);
  const message = entry.args.map(formatArg).join(" ");
  return `[${time}] [${level}] ${message}`;
}
function getFilteredLogs() {
  const filtered = [];
  let lastMessage = "";
  for (const entry of buffer) {
    const message = entry.args.map(formatArg).join(" ");
    if (isNoise(message)) continue;
    if (
      message === lastMessage &&
      filtered.length > 0 &&
      entry.timestamp - filtered[filtered.length - 1].timestamp < 1e3
    ) {
      continue;
    }
    filtered.push(entry);
    lastMessage = message;
  }
  return filtered;
}
function getLogsAsText() {
  const filtered = getFilteredLogs();
  if (filtered.length === 0) return "(no main process logs)";
  return filtered.map(formatEntry).join("\n");
}
const STATE_FILE = path.join(os.homedir(), ".kos", "window-state.json");
let debounceTimer = null;
function restoreWindowState() {
  try {
    const data = fs.readFileSync(STATE_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}
function trackWindowState(win) {
  const saveState = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      try {
        const bounds = win.getBounds();
        const state = {
          width: bounds.width,
          height: bounds.height,
          x: bounds.x,
          y: bounds.y,
          isMaximized: win.isMaximized(),
        };
        fs.mkdirSync(path.join(os.homedir(), ".kos"), { recursive: true });
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
      } catch (error) {
        console.error("Failed to save window state:", error);
      }
    }, 300);
  };
  win.on("resize", saveState);
  win.on("move", saveState);
  win.on("close", saveState);
}
installConsoleInterceptor();
let kosNative = null;
if (process.platform === "darwin") {
  try {
    kosNative = require("kos-native");
  } catch (err) {
    console.warn("Failed to load kos-native addon:", err);
  }
}
if (utils.is.dev) {
  process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";
}
const CDP_PORT = 9222;
electron.app.commandLine.appendSwitch("remote-debugging-port", String(CDP_PORT));
electron.protocol.registerSchemesAsPrivileged([
  {
    scheme: "kos-media",
    privileges: {
      stream: true,
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
    },
  },
]);
electron.ipcMain.handle("get-gateway-config", () => {
  const prodPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
  const devPath = path.join(os.homedir(), ".openclaw-dev", "openclaw.json");
  const stateDir = process.env.OPENCLAW_STATE_DIR;
  if (stateDir) {
    try {
      const configPath = path.join(stateDir, "openclaw.json");
      const raw = fs.readFileSync(configPath, "utf-8");
      const config = JSON.parse(raw);
      const port = config?.gateway?.port ?? 18789;
      const token = config?.gateway?.auth?.token;
      return { url: `ws://localhost:${port}`, token, source: configPath };
    } catch {}
  }
  try {
    const devRaw = fs.readFileSync(devPath, "utf-8");
    const devConfig = JSON.parse(devRaw);
    const port = devConfig?.gateway?.port ?? 19001;
    const token = devConfig?.gateway?.auth?.token;
    return { url: `ws://localhost:${port}`, token, source: devPath };
  } catch {}
  try {
    const raw = fs.readFileSync(prodPath, "utf-8");
    const config = JSON.parse(raw);
    const port = config?.gateway?.port ?? 18789;
    const token = config?.gateway?.auth?.token;
    return { url: `ws://localhost:${port}`, token, source: prodPath };
  } catch {
    return { url: "ws://localhost:18789", source: "default" };
  }
});
electron.ipcMain.handle("app:set-dock-badge", (_, count) => {
  if (process.platform === "darwin" && electron.app.dock) {
    electron.app.dock.setBadge(count > 0 ? String(count) : "");
  }
});
electron.ipcMain.handle("dialog:openDirectory", async () => {
  const result = await electron.dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory"],
  });
  return result;
});
electron.ipcMain.handle("logs:getMainLogs", () => {
  return getLogsAsText();
});
electron.ipcMain.handle("logs:exportToFile", async (_, rendererLogs) => {
  const { writeFileSync, mkdirSync } = await import("fs");
  const logDir = path.join(os.homedir(), ".openclaw");
  const logPath = path.join(logDir, "kos-debug.log");
  try {
    mkdirSync(logDir, { recursive: true });
    const mainLogs = getLogsAsText();
    const combined = `${rendererLogs}

${"=".repeat(50)}
=== Main Process Logs ===
${"=".repeat(50)}

${mainLogs}`;
    writeFileSync(logPath, combined, "utf-8");
    return { success: true, path: logPath };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});
const activeCaptures = /* @__PURE__ */ new Map();
electron.ipcMain.handle("simulator:list-windows", async () => {
  if (!kosNative) return [];
  return kosNative.listSimulatorWindows();
});
electron.ipcMain.handle("simulator:has-screen-permission", () => {
  if (!kosNative) return false;
  return kosNative.hasScreenRecordingPermission();
});
electron.ipcMain.handle("simulator:request-screen-permission", () => {
  if (!kosNative) return;
  kosNative.requestScreenRecordingPermission();
});
electron.ipcMain.handle("simulator:has-accessibility-permission", () => {
  if (!kosNative) return false;
  return kosNative.hasAccessibilityPermission();
});
electron.ipcMain.handle("simulator:request-accessibility-permission", () => {
  if (!kosNative) return;
  kosNative.requestAccessibilityPermission();
});
electron.ipcMain.handle("simulator:start-capture", async (event, windowId, config) => {
  if (!kosNative) return { success: false, error: "Native addon not available" };
  const existingStop = activeCaptures.get(windowId);
  if (existingStop) {
    existingStop();
    activeCaptures.delete(windowId);
  }
  try {
    const stopFn = await kosNative.startCapture(
      windowId,
      config,
      (frame) => {
        event.sender.send("simulator:frame", windowId, {
          buffer: frame.buffer,
          width: frame.width,
          height: frame.height,
          bytesPerRow: frame.bytesPerRow,
          timestamp: frame.timestamp,
        });
      },
      (error) => {
        event.sender.send("simulator:error", windowId, error.message);
      },
    );
    activeCaptures.set(windowId, stopFn);
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});
electron.ipcMain.handle("simulator:stop-capture", (_, windowId) => {
  const stopFn = activeCaptures.get(windowId);
  if (stopFn) {
    stopFn();
    activeCaptures.delete(windowId);
  }
});
electron.ipcMain.handle("simulator:inject-tap", (_, windowId, x, y) => {
  if (!kosNative) return;
  kosNative.injectTap(windowId, x, y);
});
electron.ipcMain.handle(
  "simulator:inject-swipe",
  (_, windowId, startX, startY, endX, endY, durationMs) => {
    if (!kosNative) return;
    kosNative.injectSwipe(windowId, startX, startY, endX, endY, durationMs);
  },
);
electron.ipcMain.handle("simulator:inject-text", (_, windowId, text) => {
  if (!kosNative) return;
  kosNative.injectText(windowId, text);
});
function createMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    // App menu (macOS only)
    ...(isMac
      ? [
          {
            label: electron.app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    // Edit menu
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    // View menu with zoom controls
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    // Window menu
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [{ type: "separator" }, { role: "front" }, { type: "separator" }, { role: "window" }]
          : [{ role: "close" }]),
      ],
    },
  ];
  const menu = electron.Menu.buildFromTemplate(template);
  electron.Menu.setApplicationMenu(menu);
}
function createWindow() {
  const saved = restoreWindowState();
  const mainWindow2 = new electron.BrowserWindow({
    width: saved?.width ?? 1400,
    height: saved?.height ?? 900,
    minWidth: 800,
    minHeight: 600,
    x: saved?.x,
    y: saved?.y,
    show: false,
    transparent: true,
    frame: process.platform !== "darwin",
    ...(process.platform !== "darwin" ? { titleBarStyle: "default" } : {}),
    ...(process.platform === "linux" ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
    },
  });
  trackWindowState(mainWindow2);
  initBrowserPanel(mainWindow2);
  if (saved?.isMaximized && process.platform !== "darwin") {
    mainWindow2.maximize();
  }
  mainWindow2.on("ready-to-show", () => {
    mainWindow2.show();
  });
  if (process.platform === "darwin") {
    mainWindow2.setWindowButtonVisibility(true);
    mainWindow2.setWindowButtonPosition({ x: 12, y: 12 });
    console.log("[liquid-glass] supported:", liquidGlass.isGlassSupported());
    mainWindow2.webContents.once("did-finish-load", () => {
      const glassId = liquidGlass.addView(mainWindow2.getNativeWindowHandle());
      console.log("[liquid-glass] addView returned:", glassId);
    });
  }
  mainWindow2.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  mainWindow2.webContents.on("console-message", (event, _level, message) => {
    if (message.includes("Autofill.")) {
      event.preventDefault();
    }
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow2.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    mainWindow2.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow2.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.app.whenReady().then(() => {
  electron.protocol.handle("kos-media", async (request) => {
    const url = new URL(request.url);
    const filePath = decodeURIComponent(url.pathname);
    if (filePath.includes("..")) {
      return new Response("Forbidden", { status: 403 });
    }
    try {
      const { statSync } = await import("fs");
      const stat = statSync(filePath);
      if (stat.isDirectory()) {
        return new Response("Not a file", { status: 400 });
      }
    } catch {
      return new Response("Not found", { status: 404 });
    }
    return electron.net.fetch("file://" + filePath);
  });
  cleanupOldScrollback();
  registerAllIpc();
  createMenu();
  utils.electronApp.setAppUserModelId("com.kinetic.kos");
  electron.app.on("browser-window-created", (_, window) => {
    utils.optimizer.watchWindowShortcuts(window);
  });
  createWindow();
  electron.app.on("activate", function () {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
let forceQuit = false;
electron.app.on("before-quit", async (event) => {
  if (forceQuit) {
    cleanupTerminals();
    return;
  }
  const activeTerminals = getTerminalsWithProcesses();
  if (activeTerminals.length === 0) {
    cleanupTerminals();
    return;
  }
  event.preventDefault();
  const processList = activeTerminals.map((t) => `  • ${t.processes.join(", ")}`).join("\n");
  const { response } = await electron.dialog.showMessageBox({
    type: "warning",
    buttons: ["Cancel", "Quit Anyway"],
    defaultId: 0,
    cancelId: 0,
    title: "Terminals have running processes",
    message: `${activeTerminals.length} terminal${activeTerminals.length > 1 ? "s have" : " has"} running processes:`,
    detail: `${processList}

Quitting will terminate these processes.`,
  });
  if (response === 1) {
    forceQuit = true;
    cleanupTerminals();
    electron.app.quit();
  }
});
