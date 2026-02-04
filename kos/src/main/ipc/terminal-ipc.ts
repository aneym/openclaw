import { ipcMain, BrowserWindow } from "electron";
import {
  createTerminal,
  writeTerminal,
  resizeTerminal,
  killTerminal,
  getTerminalInfo,
  killAllTerminals,
} from "../services/terminal-service";

export function registerTerminalIpc(): void {
  // Create a new terminal
  ipcMain.handle(
    "terminal:create",
    (event, cwd: string | undefined, cols: number, rows: number) => {
      const win = BrowserWindow.fromWebContents(event.sender);

      const info = createTerminal(
        cwd,
        cols,
        rows,
        // onData callback - send data to renderer
        (data: string) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send("terminal:data", info.id, data);
          }
        },
        // onExit callback - notify renderer
        (code: number) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send("terminal:exit", info.id, code);
          }
        },
      );

      return { id: info.id, pid: info.pid };
    },
  );

  // Write data to terminal
  ipcMain.handle("terminal:write", (_, id: string, data: string) => {
    writeTerminal(id, data);
  });

  // Resize terminal
  ipcMain.handle("terminal:resize", (_, id: string, cols: number, rows: number) => {
    resizeTerminal(id, cols, rows);
  });

  // Kill terminal
  ipcMain.handle("terminal:kill", (_, id: string) => {
    killTerminal(id);
  });

  // Get terminal info
  ipcMain.handle("terminal:info", (_, id: string) => {
    return getTerminalInfo(id);
  });
}

// Cleanup function to be called on app quit
export function cleanupTerminals(): void {
  killAllTerminals();
}
