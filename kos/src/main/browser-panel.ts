import { BrowserView, BrowserWindow, ipcMain } from "electron";

interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Tab {
  id: string;
  view: BrowserView;
  url: string;
  title: string;
}

// Track all tabs and which is active
const tabs = new Map<string, Tab>();
let activeTabId: string | null = null;
let mainWindow: BrowserWindow | null = null;
let currentBounds: Rectangle | null = null;

function generateTabId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createBrowserView(): BrowserView {
  return new BrowserView({
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

function getActiveView(): BrowserView | null {
  if (!activeTabId) return null;
  return tabs.get(activeTabId)?.view ?? null;
}

function showTab(tabId: string) {
  if (!mainWindow || !currentBounds) return;

  // Hide all tabs
  for (const tab of tabs.values()) {
    tab.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  }

  // Show the requested tab
  const tab = tabs.get(tabId);
  if (tab) {
    tab.view.setBounds(currentBounds);
    tab.view.webContents.focus();
    activeTabId = tabId;
  }
}

function getTabInfo(tab: Tab): { id: string; url: string; title: string; active: boolean } {
  return {
    id: tab.id,
    url: tab.view.webContents.getURL() || tab.url,
    title: tab.view.webContents.getTitle() || tab.title || "New Tab",
    active: tab.id === activeTabId,
  };
}

export function initBrowserPanel(window: BrowserWindow) {
  mainWindow = window;

  // Initialize browser panel with bounds (creates first tab if none exist)
  ipcMain.handle("browser:create", (_, bounds: Rectangle) => {
    currentBounds = bounds;
    if (tabs.size === 0) {
      // Create initial tab
      const id = generateTabId();
      const view = createBrowserView();
      mainWindow!.addBrowserView(view);
      view.setBounds(bounds);
      view.setAutoResize({ width: true, height: true });
      view.webContents.debugger.attach("1.3");
      view.webContents.loadURL("about:blank");
      view.webContents.focus();

      tabs.set(id, { id, view, url: "about:blank", title: "New Tab" });
      activeTabId = id;
      return id;
    }
    // Already have tabs, just update bounds
    if (activeTabId) {
      showTab(activeTabId);
    }
    return activeTabId;
  });

  // Create a new tab
  ipcMain.handle("browser:create-tab", (_, url?: string) => {
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

  // Close a tab
  ipcMain.handle("browser:close-tab", (_, tabId: string) => {
    const tab = tabs.get(tabId);
    if (!tab || !mainWindow) return false;

    try {
      tab.view.webContents.debugger.detach();
    } catch {
      // Debugger may already be detached
    }
    mainWindow.removeBrowserView(tab.view);
    tabs.delete(tabId);

    // If we closed the active tab, switch to another
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

  // Switch to a tab
  ipcMain.handle("browser:switch-tab", (_, tabId: string) => {
    if (!tabs.has(tabId)) return false;
    showTab(tabId);
    return true;
  });

  // List all tabs
  ipcMain.handle("browser:list-tabs", () => {
    return Array.from(tabs.values()).map(getTabInfo);
  });

  // Focus the active browser
  ipcMain.handle("browser:focus", () => {
    getActiveView()?.webContents.focus();
  });

  // Hide the BrowserView (set bounds to zero so it doesn't capture clicks)
  ipcMain.handle("browser:hide", () => {
    for (const tab of tabs.values()) {
      tab.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }
  });

  // Show the BrowserView (restore bounds for active tab)
  ipcMain.handle("browser:show", () => {
    if (activeTabId && currentBounds) {
      showTab(activeTabId);
    }
  });

  // Destroy all tabs (cleanup)
  ipcMain.handle("browser:destroy", () => {
    if (!mainWindow) return;
    for (const tab of tabs.values()) {
      try {
        tab.view.webContents.debugger.detach();
      } catch {
        // Debugger may already be detached
      }
      mainWindow.removeBrowserView(tab.view);
    }
    tabs.clear();
    activeTabId = null;
  });

  // Update bounds for all tabs (only active one is visible)
  ipcMain.handle("browser:set-bounds", (_, bounds: Rectangle) => {
    currentBounds = bounds;
    if (activeTabId) {
      showTab(activeTabId);
    }
  });

  // Navigate the active tab (or specific tab)
  ipcMain.handle("browser:navigate", (_, url: string, tabId?: string) => {
    const targetId = tabId || activeTabId;
    if (!targetId) return;
    const tab = tabs.get(targetId);
    if (tab) {
      tab.url = url;
      tab.view.webContents.loadURL(url);
    }
  });

  // Execute CDP command on active tab (or specific tab)
  ipcMain.handle("browser:cdp", async (_, method: string, params?: object, tabId?: string) => {
    const targetId = tabId || activeTabId;
    if (!targetId) throw new Error("No active tab");
    const tab = tabs.get(targetId);
    if (!tab) throw new Error("Tab not found");
    return tab.view.webContents.debugger.sendCommand(method, params);
  });

  // Open DevTools for active tab
  ipcMain.handle("browser:devtools", (_, tabId?: string) => {
    const targetId = tabId || activeTabId;
    if (!targetId) return;
    tabs.get(targetId)?.view.webContents.openDevTools({ mode: "detach" });
  });

  // Get CDP WebSocket URL for a specific tab (or active tab)
  ipcMain.handle("browser:get-cdp-url", async (_, tabId?: string) => {
    const targetId = tabId || activeTabId;
    if (!targetId) return null;
    const tab = tabs.get(targetId);
    if (!tab) return null;

    try {
      const response = await fetch("http://localhost:9222/json");
      const targets = (await response.json()) as {
        id: string;
        type: string;
        url: string;
        title: string;
        webSocketDebuggerUrl?: string;
      }[];

      // Match by the current URL of our tab
      const currentUrl = tab.view.webContents.getURL();
      const target = targets.find(
        (t) => t.type === "page" && t.url === currentUrl && t.webSocketDebuggerUrl,
      );
      if (target?.webSocketDebuggerUrl) {
        return target.webSocketDebuggerUrl;
      }

      // Fallback: find a page target that's NOT the main window
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

  // Get info about a specific tab
  ipcMain.handle("browser:get-tab", (_, tabId: string) => {
    const tab = tabs.get(tabId);
    if (!tab) return null;
    return getTabInfo(tab);
  });

  // Get active tab ID
  ipcMain.handle("browser:get-active-tab", () => {
    return activeTabId;
  });
}

// Called from gateway client when CDP message arrives
export async function handleCdpMessage(
  method: string,
  params: object,
  tabId?: string,
): Promise<unknown> {
  const targetId = tabId || activeTabId;
  if (!targetId) throw new Error("No active tab");
  const tab = tabs.get(targetId);
  if (!tab) throw new Error("Tab not found");
  return tab.view.webContents.debugger.sendCommand(method, params);
}
