import { BrowserWindow } from "electron";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { getKosDir } from "./services/config-storage";

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized?: boolean;
}

const STATE_FILE = join(getKosDir(), "window-state.json");

let debounceTimer: NodeJS.Timeout | null = null;

export function restoreWindowState(): WindowState | null {
  try {
    const data = readFileSync(STATE_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function trackWindowState(win: BrowserWindow): void {
  const saveState = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      try {
        const bounds = win.getBounds();
        const state: WindowState = {
          width: bounds.width,
          height: bounds.height,
          x: bounds.x,
          y: bounds.y,
          isMaximized: win.isMaximized(),
        };

        writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
      } catch (error) {
        console.error("Failed to save window state:", error);
      }
    }, 300);
  };

  win.on("resize", saveState);
  win.on("move", saveState);
  win.on("close", saveState);
}
