import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";

export interface RunningSessionEntry {
  sessionId: string;
  runId: string;
  startedAt: number;
  pid: number;
}

export interface RunningSessionsState {
  version: 1;
  sessions: Record<string, RunningSessionEntry>;
}

export interface InterruptedSession {
  sessionKey: string;
  sessionId: string;
  runId: string;
  startedAt: number;
  pid: number;
}

const FILENAME = "running-sessions.json";

export function resolveRunningSessionsPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveStateDir(env), FILENAME);
}

function readStateSync(env: NodeJS.ProcessEnv = process.env): RunningSessionsState {
  const filePath = resolveRunningSessionsPath(env);
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as RunningSessionsState;
    if (!parsed || parsed.version !== 1 || !parsed.sessions) {
      return { version: 1, sessions: {} };
    }
    return parsed;
  } catch {
    return { version: 1, sessions: {} };
  }
}

function writeStateSync(state: RunningSessionsState, env: NodeJS.ProcessEnv = process.env): void {
  const filePath = resolveRunningSessionsPath(env);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
  fs.renameSync(tmp, filePath);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Mark a session as having an active agent run. Sync write for crash safety. */
export function markSessionRunning(
  params: { sessionKey: string; sessionId: string; runId: string },
  env: NodeJS.ProcessEnv = process.env,
): void {
  const state = readStateSync(env);
  state.sessions[params.sessionKey] = {
    sessionId: params.sessionId,
    runId: params.runId,
    startedAt: Date.now(),
    pid: process.pid,
  };
  writeStateSync(state, env);
}

/** Clear the running mark after a turn completes. Sync write for crash safety. */
export function clearSessionRunning(
  sessionKey: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const state = readStateSync(env);
  if (!(sessionKey in state.sessions)) {
    return;
  }
  delete state.sessions[sessionKey];
  writeStateSync(state, env);
}

/**
 * On startup: read state file, return sessions that were running when the
 * previous process died, and clear the file. Entries whose PID is still
 * alive are skipped (the process somehow survived).
 */
export function consumeInterruptedSessions(
  env: NodeJS.ProcessEnv = process.env,
): InterruptedSession[] {
  const state = readStateSync(env);
  const entries = Object.entries(state.sessions);
  if (entries.length === 0) {
    return [];
  }

  const interrupted: InterruptedSession[] = [];
  for (const [sessionKey, entry] of entries) {
    // Skip if the owning process is still alive
    if (isProcessAlive(entry.pid)) {
      continue;
    }
    interrupted.push({
      sessionKey,
      sessionId: entry.sessionId,
      runId: entry.runId,
      startedAt: entry.startedAt,
      pid: entry.pid,
    });
  }

  // Clear the file after consuming
  writeStateSync({ version: 1, sessions: {} }, env);
  return interrupted;
}

/** Get current running session keys (for diagnostics). */
export function getRunningSessionKeys(env: NodeJS.ProcessEnv = process.env): string[] {
  const state = readStateSync(env);
  return Object.keys(state.sessions);
}
