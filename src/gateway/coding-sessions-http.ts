/**
 * coding-sessions-http.ts — HTTP API for coding session state + live output
 *
 * GET    /api/coding-sessions              → list all sessions
 * GET    /api/coding-sessions/:id/log      → raw output from exec session registry
 * POST   /api/coding-sessions/:id/kill     → kill a running session
 * POST   /api/coding-sessions/:id/respond  → pipe answer back to Claude Code stdin
 * POST   /api/coding-sessions/:id/terminal → open tmux session in Terminal.app
 * POST   /api/coding-sessions/:id          → update session state (upsert)
 * DELETE /api/coding-sessions/:id          → remove session from state
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { execSync } from "node:child_process";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { getSession, getFinishedSession } from "../agents/bash-process-registry.js";
import { sliceLogLines } from "../agents/bash-tools.shared.js";

/* ── State file helpers ── */

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

function parseQuery(req: IncomingMessage): URLSearchParams {
  const qIdx = req.url?.indexOf("?") ?? -1;
  return new URLSearchParams(qIdx >= 0 ? req.url!.slice(qIdx + 1) : "");
}

/* ── Router ── */

export function handleCodingSessionsRequest(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): boolean {
  if (!pathname.startsWith("/api/coding-sessions")) return false;

  /* ── List all sessions ── */
  if (req.method === "GET" && pathname === "/api/coding-sessions") {
    const state = readState();
    const sessions = Object.values(state.sessions).sort(
      (a: any, b: any) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
    json(res, { sessions });
    return true;
  }

  /* ── Delete / dismiss a session from state ── */
  if (req.method === "DELETE" && /^\/api\/coding-sessions\/[^/]+$/.test(pathname)) {
    const id = pathname.split("/")[3]!;
    const state = readState();
    if (!state.sessions[id]) {
      json(res, { error: "Session not found" }, 404);
      return true;
    }
    delete state.sessions[id];
    writeState(state);
    json(res, { ok: true, deleted: id });
    return true;
  }

  /* ── Log endpoint — raw output from exec session registry ── */
  if (req.method === "GET" && /^\/api\/coding-sessions\/[^/]+\/log$/.test(pathname)) {
    const id = pathname.split("/")[3]!;
    const state = readState();
    const session = state.sessions[id];
    if (!session) {
      json(res, { error: "Session not found" }, 404);
      return true;
    }

    const execId = session.execSessionId;
    if (!execId) {
      json(res, { lines: "", totalLines: 0, totalChars: 0, running: false });
      return true;
    }

    // Look up in the native exec session registry
    const execRunning = getSession(execId);
    const execFinished = getFinishedSession(execId);
    const target = execRunning ?? execFinished;

    if (!target) {
      json(res, {
        lines: "",
        totalLines: 0,
        totalChars: 0,
        running: false,
        expired: true,
      });
      return true;
    }

    const qs = parseQuery(req);
    const offset = parseInt(qs.get("offset") || "0", 10);
    const limit = parseInt(qs.get("limit") || "500", 10);
    const { slice, totalLines, totalChars } = sliceLogLines(target.aggregated, offset, limit);

    json(res, {
      lines: slice,
      totalLines,
      totalChars,
      running: !!execRunning && !execRunning.exited,
      offset,
    });
    return true;
  }

  /* ── Kill a session ── */
  if (req.method === "POST" && /^\/api\/coding-sessions\/[^/]+\/kill$/.test(pathname)) {
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
      } catch {
        /* already dead */
      }
    }
    session.status = "aborted";
    session.finishedAt = new Date().toISOString();
    writeState(state);
    json(res, { ok: true, id });
    return true;
  }

  /* ── Open terminal — attach to the tmux session in a new terminal window ── */
  if (req.method === "POST" && /^\/api\/coding-sessions\/[^/]+\/terminal$/.test(pathname)) {
    const id = pathname.split("/")[3]!;
    const state = readState();
    const session = state.sessions[id];
    if (!session) {
      json(res, { error: "Session not found" }, 404);
      return true;
    }

    const tmuxName = session.tmuxSession;
    if (!tmuxName) {
      json(res, { error: "No tmux session linked" }, 400);
      return true;
    }

    // Check if tmux session exists
    try {
      execSync(`tmux has-session -t ${tmuxName} 2>/dev/null`);
    } catch {
      json(res, { error: "tmux session no longer exists" }, 410);
      return true;
    }

    // Open a new terminal window attached to the tmux session
    try {
      execSync(
        `osascript -e 'tell application "Terminal" to do script "tmux attach-session -t ${tmuxName}"' -e 'tell application "Terminal" to activate'`,
      );
      json(res, { ok: true, tmuxSession: tmuxName });
    } catch (e: any) {
      json(res, { error: `Failed to open terminal: ${e.message}` }, 500);
    }
    return true;
  }

  /* ── Respond — pipe an answer back to Claude Code via exec session stdin ── */
  if (req.method === "POST" && /^\/api\/coding-sessions\/[^/]+\/respond$/.test(pathname)) {
    const id = pathname.split("/")[3]!;
    const state = readState();
    const session = state.sessions[id];
    if (!session) {
      json(res, { error: "Session not found" }, 404);
      return true;
    }

    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const { text, toolUseId } = JSON.parse(body);
        if (!text) {
          json(res, { error: "text is required" }, 400);
          return;
        }

        const execId = session.execSessionId;
        if (!execId) {
          json(res, { error: "No exec session linked" }, 400);
          return;
        }

        const execSession = getSession(execId);
        if (!execSession) {
          json(res, { error: "Exec session not found or finished" }, 410);
          return;
        }

        const stdin = (execSession as any).stdin ?? (execSession as any).child?.stdin;
        if (!stdin || stdin.destroyed) {
          json(res, { error: "Session stdin not writable" }, 410);
          return;
        }

        // Format as stream-json user message with tool result
        const response = toolUseId
          ? JSON.stringify({
              type: "user",
              message: {
                role: "user",
                content: [{ tool_use_id: toolUseId, type: "tool_result", content: text }],
              },
            })
          : text;

        stdin.write(response + "\n", (err: Error | null | undefined) => {
          if (err) {
            json(res, { error: `Write failed: ${err.message}` }, 500);
          } else {
            // Clear pending question status
            if (session.status === "waiting") {
              session.status = "running";
              writeState(state);
            }
            json(res, { ok: true });
          }
        });
      } catch {
        json(res, { error: "Invalid JSON body" }, 400);
      }
    });
    return true;
  }

  /* ── Update / upsert a session (agent writes metadata here) ── */
  if (
    req.method === "POST" &&
    /^\/api\/coding-sessions\/[^/]+$/.test(pathname) &&
    !pathname.endsWith("/kill") &&
    !pathname.endsWith("/log") &&
    !pathname.endsWith("/respond") &&
    !pathname.endsWith("/terminal")
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
