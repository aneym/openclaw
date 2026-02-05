import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { app, shell, BrowserWindow, ipcMain, dialog, Menu, protocol, net } from "electron";
import liquidGlass from "electron-liquid-glass";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import icon from "../../resources/icon.png?asset";
import { initBrowserPanel } from "./browser-panel";
import { registerAllIpc, cleanupTerminals } from "./ipc";
import { installConsoleInterceptor, getLogsAsText } from "./log-buffer";
import { getTerminalsWithProcesses, cleanupOldScrollback } from "./services/terminal-service";
import { restoreWindowState, trackWindowState } from "./window-state";

// Install console interceptor early to capture all logs
installConsoleInterceptor();

// Conditionally import native addon (macOS only)
let kosNative: typeof import("kos-native") | null = null;
if (process.platform === "darwin") {
  try {
    kosNative = require("kos-native");
  } catch (err) {
    console.warn("Failed to load kos-native addon:", err);
  }
}

// Suppress CSP warning in dev mode (unsafe-eval is required for Vite HMR)
// The warning says it won't show in packaged apps anyway
if (is.dev) {
  process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";
}

// Enable remote debugging for CDP access (Playwright, Puppeteer, etc.)
const CDP_PORT = 9222;
app.commandLine.appendSwitch("remote-debugging-port", String(CDP_PORT));

// Register kos-media:// protocol for serving local media files to the renderer
protocol.registerSchemesAsPrivileged([
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

// Read OpenClaw gateway config - checks both prod and dev locations
ipcMain.handle("get-gateway-config", () => {
  const prodPath = join(homedir(), ".openclaw", "openclaw.json");
  const devPath = join(homedir(), ".openclaw-dev", "openclaw.json");

  // Check for OPENCLAW_STATE_DIR override
  const stateDir = process.env.OPENCLAW_STATE_DIR;
  if (stateDir) {
    try {
      const configPath = join(stateDir, "openclaw.json");
      const raw = readFileSync(configPath, "utf-8");
      const config = JSON.parse(raw);
      const port = config?.gateway?.port ?? 18789;
      const token = config?.gateway?.auth?.token;
      return { url: `ws://localhost:${port}`, token, source: configPath };
    } catch {
      // Fall through to default logic
    }
  }

  // Try dev config first if it exists (for active development)
  try {
    const devRaw = readFileSync(devPath, "utf-8");
    const devConfig = JSON.parse(devRaw);
    const port = devConfig?.gateway?.port ?? 19001;
    const token = devConfig?.gateway?.auth?.token;
    return { url: `ws://localhost:${port}`, token, source: devPath };
  } catch {
    // Dev config doesn't exist, fall through to prod
  }

  // Fall back to prod config
  try {
    const raw = readFileSync(prodPath, "utf-8");
    const config = JSON.parse(raw);
    const port = config?.gateway?.port ?? 18789;
    const token = config?.gateway?.auth?.token;
    return { url: `ws://localhost:${port}`, token, source: prodPath };
  } catch {
    return { url: "ws://localhost:18789", source: "default" };
  }
});

// Dock badge (macOS)
ipcMain.handle("app:set-dock-badge", (_, count: number) => {
  if (process.platform === "darwin" && app.dock) {
    app.dock.setBadge(count > 0 ? String(count) : "");
  }
});

// Directory picker for project repository path
ipcMain.handle("dialog:openDirectory", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory"],
  });
  return result;
});

// Get main process logs for debugging
ipcMain.handle("logs:getMainLogs", () => {
  return getLogsAsText();
});

// Export logs to file for agent access (~/.openclaw/kos-debug.log)
ipcMain.handle("logs:exportToFile", async (_, rendererLogs: string) => {
  const { writeFileSync, mkdirSync } = await import("fs");
  const logDir = join(homedir(), ".openclaw");
  const logPath = join(logDir, "kos-debug.log");

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

// iOS Simulator capture handlers (macOS only)
const activeCaptures = new Map<number, () => void>();

ipcMain.handle("simulator:list-windows", async () => {
  if (!kosNative) return [];
  return kosNative.listSimulatorWindows();
});

ipcMain.handle("simulator:has-screen-permission", () => {
  if (!kosNative) return false;
  return kosNative.hasScreenRecordingPermission();
});

ipcMain.handle("simulator:request-screen-permission", () => {
  if (!kosNative) return;
  kosNative.requestScreenRecordingPermission();
});

ipcMain.handle("simulator:has-accessibility-permission", () => {
  if (!kosNative) return false;
  return kosNative.hasAccessibilityPermission();
});

ipcMain.handle("simulator:request-accessibility-permission", () => {
  if (!kosNative) return;
  kosNative.requestAccessibilityPermission();
});

ipcMain.handle(
  "simulator:start-capture",
  async (event, windowId: number, config: { fps?: number; scaleFactor?: number }) => {
    if (!kosNative) return { success: false, error: "Native addon not available" };

    // Stop any existing capture for this window
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
          // Send frame to renderer
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
  },
);

ipcMain.handle("simulator:stop-capture", (_, windowId: number) => {
  const stopFn = activeCaptures.get(windowId);
  if (stopFn) {
    stopFn();
    activeCaptures.delete(windowId);
  }
});

ipcMain.handle("simulator:inject-tap", (_, windowId: number, x: number, y: number) => {
  if (!kosNative) return;
  kosNative.injectTap(windowId, x, y);
});

ipcMain.handle(
  "simulator:inject-swipe",
  (
    _,
    windowId: number,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    durationMs: number,
  ) => {
    if (!kosNative) return;
    kosNative.injectSwipe(windowId, startX, startY, endX, endY, durationMs);
  },
);

ipcMain.handle("simulator:inject-text", (_, windowId: number, text: string) => {
  if (!kosNative) return;
  kosNative.injectText(windowId, text);
});

function createMenu(): void {
  const isMac = process.platform === "darwin";

  const template: Electron.MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
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
          ? [
              { type: "separator" as const },
              { role: "front" as const },
              { type: "separator" as const },
              { role: "window" as const },
            ]
          : [{ role: "close" as const }]),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow(): void {
  const saved = restoreWindowState();

  // Create the browser window with larger default size
  const mainWindow = new BrowserWindow({
    width: saved?.width ?? 1400,
    height: saved?.height ?? 900,
    minWidth: 800,
    minHeight: 600,
    x: saved?.x,
    y: saved?.y,
    show: false,
    transparent: true,
    frame: process.platform !== "darwin",
    ...(process.platform !== "darwin" ? { titleBarStyle: "default" as const } : {}),
    ...(process.platform === "linux" ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
    },
  });

  // Track window state for persistence
  trackWindowState(mainWindow);

  // Initialize browser panel IPC handlers
  initBrowserPanel(mainWindow);

  // NOTE: maximize() breaks transparent frameless windows on macOS
  // Skip maximize restore when transparency is enabled
  if (saved?.isMaximized && process.platform !== "darwin") {
    mainWindow.maximize();
  }

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  // Apply macOS liquid glass effect behind the web content
  if (process.platform === "darwin") {
    mainWindow.setWindowButtonVisibility(true);
    mainWindow.setWindowButtonPosition({ x: 12, y: 12 });
    console.log("[liquid-glass] supported:", liquidGlass.isGlassSupported());
    mainWindow.webContents.once("did-finish-load", () => {
      const glassId = liquidGlass.addView(mainWindow.getNativeWindowHandle());
      console.log("[liquid-glass] addView returned:", glassId);
    });
  }

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  // HMR for renderer base on electron-vite cli.
  // Suppress noisy Autofill CDP errors that Electron doesn't support
  mainWindow.webContents.on("console-message", (event, _level, message) => {
    if (message.includes("Autofill.")) {
      event.preventDefault();
    }
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    // Open DevTools detached — docked DevTools break window transparency
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  // Handle kos-media:// requests — serve local files to the renderer
  protocol.handle("kos-media", async (request) => {
    // URL format: kos-media://local/var/folders/.../file.mp3 → /var/folders/.../file.mp3
    // hostname is "local" (placeholder), pathname is the full absolute path
    const url = new URL(request.url);
    const filePath = decodeURIComponent(url.pathname);

    // Security: reject traversal attempts and validate the path
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

    // Delegate to Electron's net module which handles MIME types
    return net.fetch("file://" + filePath);
  });

  // Clean up old terminal scrollback files (older than 7 days)
  cleanupOldScrollback();

  // Register IPC handlers for project management, git, GitHub, Linear
  registerAllIpc();

  // Set up application menu with zoom shortcuts (Cmd+0, Cmd+-, Cmd+=)
  createMenu();

  // Set app user model id for windows
  electronApp.setAppUserModelId("com.kinetic.kos");

  // Default open or close DevTools by F12 in development
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  createWindow();

  app.on("activate", function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Track if user confirmed quit (to avoid re-prompting)
let forceQuit = false;

// Warn about running terminal processes before quitting
app.on("before-quit", async (event) => {
  if (forceQuit) {
    cleanupTerminals();
    return;
  }

  const activeTerminals = getTerminalsWithProcesses();
  if (activeTerminals.length === 0) {
    cleanupTerminals();
    return;
  }

  // Prevent quit to show dialog
  event.preventDefault();

  // Build message listing active processes
  const processList = activeTerminals.map((t) => `  • ${t.processes.join(", ")}`).join("\n");

  const { response } = await dialog.showMessageBox({
    type: "warning",
    buttons: ["Cancel", "Quit Anyway"],
    defaultId: 0,
    cancelId: 0,
    title: "Terminals have running processes",
    message: `${activeTerminals.length} terminal${activeTerminals.length > 1 ? "s have" : " has"} running processes:`,
    detail: `${processList}\n\nQuitting will terminate these processes.`,
  });

  if (response === 1) {
    // User chose "Quit Anyway"
    forceQuit = true;
    cleanupTerminals();
    app.quit();
  }
});
