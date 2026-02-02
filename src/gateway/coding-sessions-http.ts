/**
 * coding-sessions-http.ts — HTTP API for coding session state
 *
 * Serves the coding-sessions.json state file to the UI.
 * GET /api/coding-sessions → list all sessions
 * POST /api/coding-sessions/:id/kill → kill a session
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function getStateFilePath(): string {
  const workspace =
    process.env.OPENCLAW_WORKSPACE || join(process.env.HOME || "~", ".openclaw", "workspace");
  return join(workspace, "state", "coding-sessions.json");
}

function readState(): { sessions: Record<string, unknown> } {
  const path = getStateFilePath();
  try {
    if (!existsSync(path)) return { sessions: {} };
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return { sessions: {} };
  }
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

  if (req.method === "GET" && pathname === "/api/coding-sessions") {
    const state = readState();
    // Convert to array sorted by startedAt descending
    const sessions = Object.values(state.sessions).sort((a: any, b: any) => {
      return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
    });
    json(res, { sessions });
    return true;
  }

  // Kill a session
  if (req.method === "POST" && pathname.match(/^\/api\/coding-sessions\/[^/]+\/kill$/)) {
    const id = pathname.split("/")[3];
    const state = readState();
    const session = state.sessions[id] as any;
    if (!session) {
      json(res, { error: "Session not found" }, 404);
      return true;
    }
    if (session.pid) {
      try {
        process.kill(session.pid, "SIGTERM");
      } catch {}
    }
    json(res, { ok: true, id });
    return true;
  }

  return false;
}
