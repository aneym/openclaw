/**
 * coding-sessions-http.ts — HTTP API for coding session state
 *
 * GET  /api/coding-sessions              → list all sessions
 * POST /api/coding-sessions/:id/kill     → kill a session
 * POST /api/coding-sessions/:id          → update session state
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

function getStateFilePath(): string {
  const workspace =
    process.env.OPENCLAW_WORKSPACE || join(process.env.HOME || "~", ".openclaw", "workspace");
  return join(workspace, "state", "coding-sessions.json");
}

function readState(): { sessions: Record<string, any> } {
  const path = getStateFilePath();
  try {
    if (!existsSync(path)) return { sessions: {} };
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return { sessions: {} };
  }
}

function writeState(state: { sessions: Record<string, any> }) {
  const path = getStateFilePath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2) + "\n");
}

function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

export function handleCodingSessionsRequest(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): boolean {
  if (!pathname.startsWith("/api/coding-sessions")) return false;

  // List sessions
  if (req.method === "GET" && pathname === "/api/coding-sessions") {
    const state = readState();
    const sessions = Object.values(state.sessions).sort((a: any, b: any) => {
      return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
    });
    json(res, { sessions });
    return true;
  }

  // Kill a session
  if (req.method === "POST" && pathname.match(/^\/api\/coding-sessions\/[^/]+\/kill$/)) {
    const id = pathname.split("/")[3]!;
    const state = readState();
    const session = state.sessions[id];
    if (!session) {
      json(res, { error: "Session not found" }, 404);
      return true;
    }
    if (session.pid) {
      try {
        process.kill(session.pid, "SIGTERM");
      } catch {}
    }
    session.status = "aborted";
    writeState(state);
    json(res, { ok: true, id });
    return true;
  }

  // Update a session (agent posts progress here)
  if (
    req.method === "POST" &&
    pathname.match(/^\/api\/coding-sessions\/[^/]+$/) &&
    !pathname.includes("/kill")
  ) {
    const id = pathname.split("/")[3]!;
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const update = JSON.parse(body);
        const state = readState();
        if (!state.sessions[id]) {
          state.sessions[id] = update;
        } else {
          Object.assign(state.sessions[id], update);
        }
        writeState(state);
        json(res, { ok: true });
      } catch {
        json(res, { error: "Invalid JSON" }, 400);
      }
    });
    return true;
  }

  return false;
}
