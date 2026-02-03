import type { PtyHandle, PtySpawn } from "@lydell/node-pty";
import type { WebSocket } from "ws";
/**
 * PTY session manager for the terminal pane feature.
 *
 * Spawns and manages PTY sessions backed by @lydell/node-pty.
 * Each session can be attached to a WebSocket for real-time I/O.
 *
 * Protocol:
 * - Binary WS frames: raw PTY data (both directions)
 * - Text WS frames: JSON control messages (resize, ping, exit)
 */
import { randomUUID } from "node:crypto";

export interface TerminalSession {
  id: string;
  pty: PtyHandle;
  ws: WebSocket | null;
  createdAt: number;
  cwd: string;
}

type ControlMessage = { type: "resize"; cols: number; rows: number } | { type: "ping" };

type ExitMessage = { type: "exit"; code: number };

const sessions = new Map<string, TerminalSession>();

/** Interval handle for idle cleanup. */
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// Track last-attached time for idle cleanup
const lastAttachedAt = new Map<string, number>();

function resolveShell(): string {
  const shell = process.env.SHELL?.trim();
  return shell && shell.length > 0 ? shell : "/bin/sh";
}

let cachedSpawnPty: PtySpawn | null = null;

async function getSpawnPty(): Promise<PtySpawn> {
  if (cachedSpawnPty) {
    return cachedSpawnPty;
  }
  const ptyModule = (await import("@lydell/node-pty")) as unknown as {
    spawn?: PtySpawn;
    default?: { spawn?: PtySpawn };
  };
  const spawnPty = ptyModule.spawn ?? ptyModule.default?.spawn;
  if (!spawnPty) {
    throw new Error("PTY support is unavailable (node-pty spawn not found).");
  }
  cachedSpawnPty = spawnPty;
  return spawnPty;
}

export async function createTerminalSession(cwd?: string): Promise<{ id: string }> {
  const spawnPty = await getSpawnPty();
  const id = randomUUID();
  const shell = resolveShell();
  const workdir = cwd ?? process.cwd();

  const pty = spawnPty(shell, [], {
    name: process.env.TERM ?? "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: workdir,
    env: process.env as Record<string, string>,
  });

  const session: TerminalSession = {
    id,
    pty,
    ws: null,
    createdAt: Date.now(),
    cwd: workdir,
  };

  sessions.set(id, session);
  lastAttachedAt.set(id, Date.now());

  // When PTY exits, notify attached WS and clean up
  pty.onExit(({ exitCode }) => {
    const s = sessions.get(id);
    if (!s) {
      return;
    }
    if (s.ws && s.ws.readyState === 1 /* OPEN */) {
      const msg: ExitMessage = { type: "exit", code: exitCode };
      try {
        s.ws.send(JSON.stringify(msg));
      } catch {
        // ignore send errors
      }
      s.ws.close(1000, "PTY exited");
    }
    sessions.delete(id);
    lastAttachedAt.delete(id);
  });

  ensureCleanupTimer();
  return { id };
}

export function attachWebSocket(id: string, ws: WebSocket): boolean {
  const session = sessions.get(id);
  if (!session) {
    return false;
  }

  // Detach previous WS if any
  if (session.ws && session.ws !== ws && session.ws.readyState === 1) {
    session.ws.close(1000, "Replaced by new connection");
  }

  session.ws = ws;
  lastAttachedAt.set(id, Date.now());

  // PTY data → WS binary frame
  session.pty.onData((data) => {
    if (ws.readyState === 1) {
      try {
        ws.send(Buffer.from(data, "utf8"), { binary: true });
      } catch {
        // ignore
      }
    }
  });

  // WS → PTY / control
  ws.on("message", (rawData, isBinary) => {
    if (isBinary) {
      // Binary frame: forward to PTY stdin
      const buf = rawData instanceof Buffer ? rawData : Buffer.from(rawData as ArrayBuffer);
      session.pty.write(buf.toString("utf8"));
    } else {
      // Text frame: JSON control message
      try {
        const msg = JSON.parse(rawData.toString()) as ControlMessage;
        if (msg.type === "resize" && typeof msg.cols === "number" && typeof msg.rows === "number") {
          resizeTerminal(id, msg.cols, msg.rows);
        }
        // ping: no-op (keeps connection alive)
      } catch {
        // ignore malformed control messages
      }
    }
  });

  ws.on("close", () => {
    // Keep PTY alive for reconnect, just detach WS
    if (session.ws === ws) {
      session.ws = null;
      lastAttachedAt.set(id, Date.now());
    }
  });

  return true;
}

export function resizeTerminal(id: string, cols: number, rows: number): void {
  const session = sessions.get(id);
  if (!session) {
    return;
  }
  // node-pty resize - the PtyHandle type doesn't include resize but the actual
  // object does have it at runtime
  const ptyAny = session.pty as unknown as { resize?: (cols: number, rows: number) => void };
  if (typeof ptyAny.resize === "function") {
    ptyAny.resize(Math.max(1, cols), Math.max(1, rows));
  }
}

export function killTerminal(id: string): void {
  const session = sessions.get(id);
  if (!session) {
    return;
  }
  if (session.ws && session.ws.readyState === 1) {
    session.ws.close(1000, "Terminal killed");
  }
  // Kill the PTY process
  try {
    process.kill(session.pty.pid, "SIGKILL");
  } catch {
    // ignore - process may already be dead
  }
  sessions.delete(id);
  lastAttachedAt.delete(id);
}

export function listTerminals(): Array<{
  id: string;
  cwd: string;
  createdAt: number;
  connected: boolean;
}> {
  return [...sessions.values()].map((s) => ({
    id: s.id,
    cwd: s.cwd,
    createdAt: s.createdAt,
    connected: s.ws !== null && s.ws.readyState === 1,
  }));
}

export function getTerminalSession(id: string): TerminalSession | undefined {
  return sessions.get(id);
}

/** Kill idle sessions (no WS attached for >30 min). */
function cleanupIdleSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.ws !== null && session.ws.readyState === 1) {
      continue; // still connected
    }
    const lastActive = lastAttachedAt.get(id) ?? session.createdAt;
    if (now - lastActive > IDLE_TIMEOUT_MS) {
      killTerminal(id);
    }
  }
}

function ensureCleanupTimer() {
  if (cleanupTimer) {
    return;
  }
  cleanupTimer = setInterval(cleanupIdleSessions, 60_000);
  cleanupTimer.unref?.(); // don't prevent process exit
}

/** Shut down all terminal sessions (called on gateway shutdown). */
export function shutdownAllTerminals(): void {
  for (const id of [...sessions.keys()]) {
    killTerminal(id);
  }
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
