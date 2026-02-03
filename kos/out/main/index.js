"use strict";
const utils = require("@electron-toolkit/utils");
const electron = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const icon = path.join(__dirname, "../../resources/icon.png");
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
electron.ipcMain.handle("get-gateway-config", () => {
  try {
    const configPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
    const raw = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw);
    const port = config?.gateway?.port ?? 18789;
    const token = config?.gateway?.auth?.token;
    return { url: `ws://localhost:${port}`, token };
  } catch {
    return { url: "ws://localhost:18789" };
  }
});
electron.ipcMain.handle("dialog:openDirectory", async () => {
  const result = await electron.dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory"],
  });
  return result;
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
  const mainWindow = new electron.BrowserWindow({
    width: saved?.width ?? 1400,
    height: saved?.height ?? 900,
    minWidth: 800,
    minHeight: 600,
    x: saved?.x,
    y: saved?.y,
    show: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    ...(process.platform === "darwin"
      ? {
          trafficLightPosition: { x: 12, y: 12 },
        }
      : {}),
    ...(process.platform === "linux" ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
    },
  });
  trackWindowState(mainWindow);
  if (saved?.isMaximized) {
    mainWindow.maximize();
  }
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.app.whenReady().then(() => {
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
