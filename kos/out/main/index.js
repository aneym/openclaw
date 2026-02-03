"use strict";
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const utils = require("@electron-toolkit/utils");
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
const icon = path.join(__dirname, "../../resources/icon.png");
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
