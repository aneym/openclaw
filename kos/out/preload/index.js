"use strict";
const electron = require("electron");
const preload = require("@electron-toolkit/preload");
const api = {
  getGatewayConfig: () => electron.ipcRenderer.invoke("get-gateway-config"),
  openDirectoryDialog: () => electron.ipcRenderer.invoke("dialog:openDirectory"),
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
