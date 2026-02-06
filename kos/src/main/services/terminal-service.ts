import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
  statSync,
} from "fs";
import * as pty from "node-pty";
import { homedir } from "os";
import { join } from "path";
import { getKosDir } from "./config-storage";

// Scrollback storage directory — follows instance isolation (dev vs prod)
const SCROLLBACK_DIR = join(getKosDir(), "terminals");

// Ensure scrollback directory exists
function ensureScrollbackDir(): void {
  if (!existsSync(SCROLLBACK_DIR)) {
    mkdirSync(SCROLLBACK_DIR, { recursive: true });
  }
}

// Get scrollback file path for a terminal
function getScrollbackPath(terminalId: string): string {
  // Sanitize ID to be filesystem-safe
  const safeId = terminalId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(SCROLLBACK_DIR, `${safeId}.scrollback`);
}

// Save scrollback to disk
function saveScrollback(terminalId: string, scrollback: string[]): void {
  try {
    ensureScrollbackDir();
    const data = scrollback.join("");
    writeFileSync(getScrollbackPath(terminalId), data, "utf-8");
  } catch (err) {
    console.error(`[terminal-service] Failed to save scrollback for ${terminalId}:`, err);
  }
}

// Load scrollback from disk
function loadScrollback(terminalId: string): string | null {
  try {
    const path = getScrollbackPath(terminalId);
    if (existsSync(path)) {
      return readFileSync(path, "utf-8");
    }
  } catch (err) {
    console.error(`[terminal-service] Failed to load scrollback for ${terminalId}:`, err);
  }
  return null;
}

// Delete scrollback file
function deleteScrollback(terminalId: string): void {
  try {
    const path = getScrollbackPath(terminalId);
    if (existsSync(path)) {
      unlinkSync(path);
    }
  } catch {
    // Ignore errors
  }
}

// Clean up old scrollback files (older than 7 days)
export function cleanupOldScrollback(): void {
  try {
    ensureScrollbackDir();
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

    const files = readdirSync(SCROLLBACK_DIR);
    for (const file of files) {
      if (!file.endsWith(".scrollback")) continue;
      const filePath = join(SCROLLBACK_DIR, file);
      const stat = statSync(filePath);
      if (now - stat.mtimeMs > maxAge) {
        unlinkSync(filePath);
        console.log(`[terminal-service] Cleaned up old scrollback: ${file}`);
      }
    }
  } catch (err) {
    console.error("[terminal-service] Failed to cleanup old scrollback:", err);
  }
}

// Types
export interface TerminalInfo {
  id: string;
  pid: number;
  cwd: string;
  cols: number;
  rows: number;
}

// Terminal entry with PTY and mutable callbacks (for HMR reconnection)
interface TerminalEntry {
  pty: pty.IPty;
  onData: ((data: string) => void) | null;
  onExit: ((code: number) => void) | null;
  cwd: string;
  // Circular buffer of recent raw output chunks for replay on reconnect
  scrollback: string[];
  scrollbackBytes: number;
  // Debounced save timeout
  saveTimeout: ReturnType<typeof setTimeout> | null;
}

// Keep ~500KB of scrollback per terminal (enough for most sessions)
const MAX_SCROLLBACK_BYTES = 500 * 1024;

// Active terminal processes
const terminals = new Map<string, TerminalEntry>();

// Generate a unique terminal ID
function generateId(): string {
  return `term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Get the default shell for the current platform
function getDefaultShell(): string {
  if (process.platform === "darwin" || process.platform === "linux") {
    // Try SHELL env var first, then common shells
    const envShell = process.env.SHELL;
    if (envShell && existsSync(envShell)) {
      return envShell;
    }
    // Fallback to common shells
    const fallbackShells = ["/bin/zsh", "/bin/bash", "/bin/sh"];
    for (const shell of fallbackShells) {
      if (existsSync(shell)) {
        return shell;
      }
    }
    return "/bin/sh";
  }
  return process.env.COMSPEC || "cmd.exe";
}

// Create a new terminal (or get existing one if id provided and exists)
export function createTerminal(
  cwd: string | undefined,
  cols: number,
  rows: number,
  onData: (data: string) => void,
  onExit: (code: number) => void,
  existingId?: string,
): TerminalInfo {
  // If an ID is provided and terminal exists, reattach instead of creating
  if (existingId) {
    const existing = terminals.get(existingId);
    if (existing) {
      console.log(
        `[terminal-service] ✅ REATTACH to existing terminal: id=${existingId}, pid=${existing.pty.pid}, scrollback=${existing.scrollbackBytes} bytes`,
      );
      existing.onData = onData;
      existing.onExit = onExit;
      // Resize to match new dimensions
      existing.pty.resize(Math.max(cols, 1), Math.max(rows, 1));
      // Replay scrollback to new renderer (raw chunks preserve escape sequences)
      if (existing.scrollback.length > 0) {
        const scrollbackData = existing.scrollback.join("");
        // Send scrollback asynchronously so the renderer is ready
        setImmediate(() => {
          existing.onData?.(scrollbackData);
        });
      }
      return {
        id: existingId,
        pid: existing.pty.pid,
        cwd: existing.cwd,
        cols: existing.pty.cols,
        rows: existing.pty.rows,
      };
    }
    console.log(`[terminal-service] 🆕 Terminal ${existingId} not found, will create new`);
  }

  const id = existingId || generateId();
  const shell = getDefaultShell();
  const effectiveCwd = cwd && existsSync(cwd) ? cwd : homedir();

  console.log(
    `[terminal-service] Creating terminal: id=${id}, shell=${shell}, cwd=${effectiveCwd}, cols=${cols}, rows=${rows}`,
  );

  const ptyProcess = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: Math.max(cols, 1),
    rows: Math.max(rows, 1),
    cwd: effectiveCwd,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    },
  });

  console.log(`[terminal-service] Terminal created: id=${id}, pid=${ptyProcess.pid}`);

  // Try to load existing scrollback from disk (for app restart persistence)
  const savedScrollback = loadScrollback(id);
  const initialScrollback: string[] = savedScrollback ? [savedScrollback] : [];
  const initialBytes = savedScrollback?.length ?? 0;

  const entry: TerminalEntry = {
    pty: ptyProcess,
    onData,
    onExit,
    cwd: effectiveCwd,
    scrollback: initialScrollback,
    scrollbackBytes: initialBytes,
    saveTimeout: null,
  };

  // If we have saved scrollback, replay it to the renderer
  if (savedScrollback) {
    console.log(
      `[terminal-service] Loaded ${savedScrollback.length} bytes of saved scrollback for ${id}`,
    );
    setImmediate(() => {
      entry.onData?.(savedScrollback);
    });
  }

  // Handle data from the terminal - use mutable callback and buffer for replay
  ptyProcess.onData((data) => {
    // Buffer raw output chunks for replay on reconnect
    entry.scrollback.push(data);
    entry.scrollbackBytes += data.length;

    // Trim old chunks if we exceed the byte limit
    while (entry.scrollbackBytes > MAX_SCROLLBACK_BYTES && entry.scrollback.length > 1) {
      const removed = entry.scrollback.shift()!;
      entry.scrollbackBytes -= removed.length;
    }

    // Debounced save to disk (every 5 seconds of inactivity)
    if (entry.saveTimeout) clearTimeout(entry.saveTimeout);
    entry.saveTimeout = setTimeout(() => {
      saveScrollback(id, entry.scrollback);
    }, 5000);

    entry.onData?.(data);
  });

  // Handle terminal exit
  ptyProcess.onExit(({ exitCode }) => {
    // Save scrollback before exit
    if (entry.saveTimeout) clearTimeout(entry.saveTimeout);
    saveScrollback(id, entry.scrollback);

    const exitCallback = entry.onExit;
    terminals.delete(id);
    exitCallback?.(exitCode);
  });

  terminals.set(id, entry);

  return {
    id,
    pid: ptyProcess.pid,
    cwd: effectiveCwd,
    cols,
    rows,
  };
}

// Detach callbacks without killing the terminal (for HMR)
export function detachTerminal(id: string): boolean {
  const entry = terminals.get(id);
  if (entry) {
    console.log(
      `[terminal-service] 🔌 DETACH terminal: id=${id}, pid=${entry.pty.pid} (PTY stays alive)`,
    );
    entry.onData = null;
    entry.onExit = null;
    return true;
  }
  console.log(`[terminal-service] ⚠️ DETACH failed - terminal not found: id=${id}`);
  return false;
}

// Check if a terminal exists
export function hasTerminal(id: string): boolean {
  return terminals.has(id);
}

// Write data to a terminal
export function writeTerminal(id: string, data: string): void {
  const entry = terminals.get(id);
  if (entry) {
    entry.pty.write(data);
  }
}

// Resize a terminal
export function resizeTerminal(id: string, cols: number, rows: number): void {
  const entry = terminals.get(id);
  if (entry) {
    entry.pty.resize(cols, rows);
  }
}

// Kill a terminal (preserveScrollback=true keeps history for next app launch)
export function killTerminal(id: string, preserveScrollback = true): void {
  const entry = terminals.get(id);
  if (entry) {
    // Cancel pending save
    if (entry.saveTimeout) clearTimeout(entry.saveTimeout);

    if (preserveScrollback) {
      // Save scrollback for next app launch
      saveScrollback(id, entry.scrollback);
    } else {
      // Delete scrollback file
      deleteScrollback(id);
    }

    entry.pty.kill();
    terminals.delete(id);
  }
}

// Clear terminal scrollback (both memory and disk)
export function clearTerminalScrollback(id: string): void {
  const entry = terminals.get(id);
  if (entry) {
    entry.scrollback = [];
    entry.scrollbackBytes = 0;
    if (entry.saveTimeout) clearTimeout(entry.saveTimeout);
    deleteScrollback(id);
  }
}

// Get terminal info
export function getTerminalInfo(id: string): TerminalInfo | null {
  const entry = terminals.get(id);
  if (!entry) return null;

  return {
    id,
    pid: entry.pty.pid,
    cwd: entry.cwd,
    cols: entry.pty.cols,
    rows: entry.pty.rows,
  };
}

// Kill all terminals (cleanup on app exit) - saves scrollback for persistence
export function killAllTerminals(): void {
  for (const [id, entry] of terminals) {
    // Cancel pending save and save immediately
    if (entry.saveTimeout) clearTimeout(entry.saveTimeout);
    saveScrollback(id, entry.scrollback);
    entry.pty.kill();
    terminals.delete(id);
  }
}

// Get list of active terminal IDs
export function getActiveTerminals(): string[] {
  return Array.from(terminals.keys());
}

// Check if a PTY has child processes beyond the shell itself
// Returns the child process names if any
export function getTerminalChildProcesses(id: string): string[] {
  const entry = terminals.get(id);
  if (!entry) return [];

  try {
    // Use pgrep to find child processes of the shell
    const { execSync } = require("child_process");
    const result = execSync(`pgrep -P ${entry.pty.pid} 2>/dev/null || true`, {
      encoding: "utf-8",
    }).trim();

    if (!result) return [];

    // Get the names of child processes
    const childPids = result.split("\n").filter(Boolean);
    const names: string[] = [];

    for (const pid of childPids) {
      try {
        const name = execSync(`ps -p ${pid} -o comm= 2>/dev/null || true`, {
          encoding: "utf-8",
        }).trim();
        if (name) names.push(name);
      } catch {
        // Ignore errors for individual process lookups
      }
    }

    return names;
  } catch {
    return [];
  }
}

// Get all terminals with running child processes
export function getTerminalsWithProcesses(): { id: string; pid: number; processes: string[] }[] {
  const result: { id: string; pid: number; processes: string[] }[] = [];

  for (const [id, entry] of terminals) {
    const processes = getTerminalChildProcesses(id);
    if (processes.length > 0) {
      result.push({ id, pid: entry.pty.pid, processes });
    }
  }

  return result;
}

// ============================================================================
// Managed Terminal Functions (for AI agent control)
// ============================================================================

// Track which terminals are managed by AI agents
const managedTerminals = new Map<
  string,
  {
    cwd: string;
    createdAt: number;
  }
>();

// Create a managed terminal that can be controlled by AI agents
export function createManagedTerminal(
  cwd: string | undefined,
  onOutput: (data: string) => void,
): { id: string; pid: number; managed: true } {
  const id = `managed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const effectiveCwd = cwd && existsSync(cwd) ? cwd : homedir();

  console.log(`[terminal-service] Creating managed terminal: id=${id}, cwd=${effectiveCwd}`);

  // Create terminal with default 80x24 size (will be resized when panel opens)
  const info = createTerminal(
    effectiveCwd,
    80,
    24,
    onOutput, // Stream output back to renderer
    (code) => {
      console.log(`[terminal-service] Managed terminal exited: id=${id}, code=${code}`);
      managedTerminals.delete(id);
    },
    id,
  );

  managedTerminals.set(id, {
    cwd: effectiveCwd,
    createdAt: Date.now(),
  });

  return { id: info.id, pid: info.pid, managed: true };
}

// Execute a command in a managed terminal and wait for output
export async function execInManagedTerminal(
  id: string,
  command: string,
  timeoutMs = 30000,
): Promise<{ output: string; exitCode?: number }> {
  const entry = terminals.get(id);
  if (!entry) throw new Error(`Terminal ${id} not found`);
  if (!managedTerminals.has(id)) throw new Error(`Terminal ${id} is not managed`);

  return new Promise((resolve) => {
    let output = "";
    const originalOnData = entry.onData;

    // Capture output while command runs
    entry.onData = (data) => {
      output += data;
      originalOnData?.(data);
    };

    // Write command with newline
    entry.pty.write(command + "\n");

    // Use a marker to detect command completion
    // Write a unique marker after the command and wait for it in output
    const marker = `__OPENCLAW_EXEC_DONE_${Date.now()}__`;
    setTimeout(() => {
      entry.pty.write(`echo "${marker}"\n`);
    }, 100);

    // Wait for marker or timeout
    const checkInterval = setInterval(() => {
      if (output.includes(marker)) {
        clearInterval(checkInterval);
        clearTimeout(timer);
        entry.onData = originalOnData;
        // Remove the marker and echo command from output
        const cleanOutput = output.split(marker)[0].replace(`echo "${marker}"`, "").trim();
        resolve({ output: cleanOutput });
      }
    }, 100);

    const timer = setTimeout(() => {
      clearInterval(checkInterval);
      entry.onData = originalOnData;
      resolve({ output });
    }, timeoutMs);
  });
}

// Read recent output from a managed terminal
export function readManagedTerminalOutput(
  id: string,
  _since?: number, // Reserved for future use
  maxBytes = 50000,
): string {
  const entry = terminals.get(id);
  if (!entry) throw new Error(`Terminal ${id} not found`);
  if (!managedTerminals.has(id)) throw new Error(`Terminal ${id} is not managed`);

  // Return recent scrollback
  const fullOutput = entry.scrollback.join("");
  return fullOutput.slice(-maxBytes);
}

// Close a managed terminal
export function closeManagedTerminal(id: string, force = false): void {
  if (!managedTerminals.has(id)) throw new Error(`Terminal ${id} is not managed`);

  console.log(`[terminal-service] Closing managed terminal: id=${id}, force=${force}`);
  managedTerminals.delete(id);
  killTerminal(id, !force); // Preserve scrollback unless force=true
}

// Check if a terminal is managed
export function isManagedTerminal(id: string): boolean {
  return managedTerminals.has(id);
}

// List all managed terminals
export function listManagedTerminals(): {
  id: string;
  pid: number;
  cwd: string;
  createdAt: number;
}[] {
  const result: { id: string; pid: number; cwd: string; createdAt: number }[] = [];

  for (const [id, meta] of managedTerminals) {
    const entry = terminals.get(id);
    if (entry) {
      result.push({
        id,
        pid: entry.pty.pid,
        cwd: meta.cwd,
        createdAt: meta.createdAt,
      });
    }
  }

  return result;
}

// Copy managed terminal output to clipboard and return the copied text
export function copyManagedTerminalOutput(id: string, maxBytes = 50000): string {
  const entry = terminals.get(id);
  if (!entry) throw new Error(`Terminal ${id} not found`);
  if (!managedTerminals.has(id)) throw new Error(`Terminal ${id} is not managed`);

  // Get recent scrollback
  const fullOutput = entry.scrollback.join("");
  return fullOutput.slice(-maxBytes);
}
