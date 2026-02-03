/**
 * HTTP endpoints for terminal session management.
 *
 * POST /api/terminals          → create new terminal session
 * GET  /api/terminals          → list active terminals
 * POST /api/terminals/:id/kill → kill a terminal
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { loadConfig } from "../config/config.js";
import { authorizeGatewayConnect, type ResolvedGatewayAuth } from "./auth.js";
import { sendJson, sendUnauthorized, sendMethodNotAllowed, sendText } from "./http-common.js";
import { getBearerToken } from "./http-utils.js";
import { createTerminalSession, killTerminal, listTerminals } from "./terminal-pty.js";

export async function handleTerminalHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: { auth: ResolvedGatewayAuth; trustedProxies?: string[] },
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (!url.pathname.startsWith("/api/terminals")) {
    return false;
  }

  // Auth check
  const cfg = loadConfig();
  const token = getBearerToken(req);
  const authResult = await authorizeGatewayConnect({
    auth: opts.auth,
    connectAuth: token ? { token, password: token } : null,
    req,
    trustedProxies: opts.trustedProxies ?? cfg.gateway?.trustedProxies,
  });
  if (!authResult.ok) {
    sendUnauthorized(res);
    return true;
  }

  // POST /api/terminals — create new terminal
  if (url.pathname === "/api/terminals" && req.method === "POST") {
    try {
      const { id } = await createTerminalSession();
      sendJson(res, 201, { id });
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : "Failed to create terminal",
      });
    }
    return true;
  }

  // GET /api/terminals — list terminals
  if (url.pathname === "/api/terminals" && req.method === "GET") {
    sendJson(res, 200, listTerminals());
    return true;
  }

  // POST /api/terminals/:id/kill — kill a terminal
  const killMatch = url.pathname.match(/^\/api\/terminals\/([^/]+)\/kill$/);
  if (killMatch && req.method === "POST") {
    const terminalId = killMatch[1];
    killTerminal(terminalId);
    sendJson(res, 200, { ok: true });
    return true;
  }

  // Method not allowed for matched paths
  if (url.pathname === "/api/terminals") {
    sendMethodNotAllowed(res, "GET, POST");
    return true;
  }

  sendText(res, 404, "Not Found");
  return true;
}
