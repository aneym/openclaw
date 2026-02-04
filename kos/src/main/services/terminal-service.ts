import { existsSync } from "fs";
import * as pty from "node-pty";
import { homedir } from "os";

// Types
export interface TerminalInfo {
  id: string;
  pid: number;
  cwd: string;
  cols: number;
  rows: number;
}

// Active terminal processes
const terminals = new Map<string, pty.IPty>();

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

// Create a new terminal
export function createTerminal(
  cwd: string | undefined,
  cols: number,
  rows: number,
  onData: (data: string) => void,
  onExit: (code: number) => void,
): TerminalInfo {
  const id = generateId();
  const shell = getDefaultShell();
  const effectiveCwd = cwd && existsSync(cwd) ? cwd : homedir();

  console.log(
    `[terminal-service] Creating terminal: shell=${shell}, cwd=${effectiveCwd}, cols=${cols}, rows=${rows}`,
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

  // Handle data from the terminal
  ptyProcess.onData((data) => {
    onData(data);
  });

  // Handle terminal exit
  ptyProcess.onExit(({ exitCode }) => {
    terminals.delete(id);
    onExit(exitCode);
  });

  terminals.set(id, ptyProcess);

  return {
    id,
    pid: ptyProcess.pid,
    cwd: effectiveCwd,
    cols,
    rows,
  };
}

// Write data to a terminal
export function writeTerminal(id: string, data: string): void {
  const term = terminals.get(id);
  if (term) {
    term.write(data);
  }
}

// Resize a terminal
export function resizeTerminal(id: string, cols: number, rows: number): void {
  const term = terminals.get(id);
  if (term) {
    term.resize(cols, rows);
  }
}

// Kill a terminal
export function killTerminal(id: string): void {
  const term = terminals.get(id);
  if (term) {
    term.kill();
    terminals.delete(id);
  }
}

// Get terminal info
export function getTerminalInfo(id: string): TerminalInfo | null {
  const term = terminals.get(id);
  if (!term) return null;

  return {
    id,
    pid: term.pid,
    cwd: "", // node-pty doesn't expose cwd after creation
    cols: term.cols,
    rows: term.rows,
  };
}

// Kill all terminals (cleanup on app exit)
export function killAllTerminals(): void {
  for (const [id, term] of terminals) {
    term.kill();
    terminals.delete(id);
  }
}

// Get list of active terminal IDs
export function getActiveTerminals(): string[] {
  return Array.from(terminals.keys());
}
