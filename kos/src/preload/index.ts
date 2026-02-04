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

// Custom APIs for renderer
const api = {
  getGatewayConfig: (): Promise<{ url: string; token?: string; source?: string }> =>
    ipcRenderer.invoke("get-gateway-config"),
  openDirectoryDialog: (): Promise<{ canceled: boolean; filePaths: string[] }> =>
    ipcRenderer.invoke("dialog:openDirectory"),

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

  // Browser panel APIs
  browser: {
    create: (bounds: Rectangle): Promise<void> => ipcRenderer.invoke("browser:create", bounds),
    destroy: (): Promise<void> => ipcRenderer.invoke("browser:destroy"),
    setBounds: (bounds: Rectangle): Promise<void> =>
      ipcRenderer.invoke("browser:set-bounds", bounds),
    navigate: (url: string): Promise<void> => ipcRenderer.invoke("browser:navigate", url),
    cdp: (method: string, params?: object): Promise<unknown> =>
      ipcRenderer.invoke("browser:cdp", method, params),
    openDevTools: (): Promise<void> => ipcRenderer.invoke("browser:devtools"),
    getCdpUrl: (): Promise<string | null> => ipcRenderer.invoke("browser:get-cdp-url"),
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
