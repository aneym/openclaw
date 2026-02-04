import { BrowserView, BrowserWindow, ipcMain } from "electron";

interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

let browserView: BrowserView | null = null;
let mainWindow: BrowserWindow | null = null;

export function initBrowserPanel(window: BrowserWindow) {
  mainWindow = window;

  ipcMain.handle("browser:create", (_, bounds: Rectangle) => {
    if (browserView) return; // Already exists

    browserView = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    mainWindow!.addBrowserView(browserView);
    browserView.setBounds(bounds);
    browserView.webContents.debugger.attach("1.3");
    browserView.webContents.loadURL("about:blank");
  });

  ipcMain.handle("browser:destroy", () => {
    if (!browserView || !mainWindow) return;
    try {
      browserView.webContents.debugger.detach();
    } catch {
      // Debugger may already be detached
    }
    mainWindow.removeBrowserView(browserView);
    browserView = null;
  });

  ipcMain.handle("browser:set-bounds", (_, bounds: Rectangle) => {
    browserView?.setBounds(bounds);
  });

  ipcMain.handle("browser:navigate", (_, url: string) => {
    browserView?.webContents.loadURL(url);
  });

  ipcMain.handle("browser:cdp", async (_, method: string, params?: object) => {
    if (!browserView) throw new Error("No browser");
    return browserView.webContents.debugger.sendCommand(method, params);
  });

  ipcMain.handle("browser:devtools", () => {
    browserView?.webContents.openDevTools({ mode: "detach" });
  });

  // Get CDP WebSocket URL for external tools (Playwright, Puppeteer)
  ipcMain.handle("browser:get-cdp-url", async () => {
    if (!browserView) return null;

    // Get debugger info via HTTP endpoint
    try {
      const response = await fetch("http://localhost:9222/json");
      const targets = await response.json();
      // Find our BrowserView's target by matching webContents ID
      const wcId = browserView.webContents.id;
      const target = targets.find(
        (t: { id: string; webSocketDebuggerUrl?: string }) =>
          t.webSocketDebuggerUrl?.includes(`/${wcId}/`) || t.id === String(wcId),
      );
      if (target?.webSocketDebuggerUrl) {
        return target.webSocketDebuggerUrl;
      }
      // Fallback: return the first page target
      const pageTarget = targets.find((t: { type: string }) => t.type === "page");
      return pageTarget?.webSocketDebuggerUrl ?? null;
    } catch {
      return null;
    }
  });
}

// Called from gateway client when CDP message arrives
export async function handleCdpMessage(method: string, params: object): Promise<unknown> {
  if (!browserView) throw new Error("Browser not initialized");
  return browserView.webContents.debugger.sendCommand(method, params);
}
