import { ipcMain, BrowserWindow } from "electron";
import {
  createTerminal,
  writeTerminal,
  resizeTerminal,
  killTerminal,
  detachTerminal,
  hasTerminal,
  getTerminalInfo,
  killAllTerminals,
  createManagedTerminal,
  execInManagedTerminal,
  readManagedTerminalOutput,
  closeManagedTerminal,
  isManagedTerminal,
  listManagedTerminals,
} from "../services/terminal-service";

export function registerTerminalIpc(): void {
  // Create a new terminal (or reattach to existing if id provided)
  ipcMain.handle(
    "terminal:create",
    (event, cwd: string | undefined, cols: number, rows: number, existingId?: string) => {
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
        existingId,
      );

      return { id: info.id, pid: info.pid };
    },
  );

  // Detach from terminal without killing (for HMR)
  ipcMain.handle("terminal:detach", (_, id: string) => {
    return detachTerminal(id);
  });

  // Check if terminal exists
  ipcMain.handle("terminal:exists", (_, id: string) => {
    return hasTerminal(id);
  });

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

  // ============================================================================
  // Managed Terminal IPC (for AI agent control)
  // ============================================================================

  // Create a managed terminal that can be controlled by AI agents
  ipcMain.handle("terminal:createManaged", async (event, cwd?: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error("No window");

    const onOutput = (data: string) => {
      if (!win.isDestroyed()) {
        win.webContents.send("terminal:managed-output", data);
      }
    };

    return createManagedTerminal(cwd, onOutput);
  });

  // Execute a command in a managed terminal
  ipcMain.handle(
    "terminal:execManaged",
    async (_, id: string, command: string, timeoutMs?: number) => {
      return execInManagedTerminal(id, command, timeoutMs);
    },
  );

  // Read recent output from a managed terminal
  ipcMain.handle("terminal:readManaged", (_, id: string, since?: number, maxBytes?: number) => {
    return readManagedTerminalOutput(id, since, maxBytes);
  });

  // Close a managed terminal
  ipcMain.handle("terminal:closeManaged", (_, id: string, force?: boolean) => {
    return closeManagedTerminal(id, force);
  });

  // Check if a terminal is managed
  ipcMain.handle("terminal:isManaged", (_, id: string) => {
    return isManagedTerminal(id);
  });

  // List all managed terminals
  ipcMain.handle("terminal:listManaged", () => {
    return listManagedTerminals();
  });
}

// Cleanup function to be called on app quit
export function cleanupTerminals(): void {
  killAllTerminals();
}
