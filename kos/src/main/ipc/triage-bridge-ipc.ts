import { ipcMain } from "electron";
import type { TriageBridgeInfo } from "../services/triage-bridge";

let currentInfo: TriageBridgeInfo | null = null;

export function setTriageBridgeInfo(info: TriageBridgeInfo) {
  currentInfo = info;
}

export function registerTriageBridgeIpc(): void {
  ipcMain.handle("triageBridge:getInfo", () => {
    return currentInfo;
  });
}
