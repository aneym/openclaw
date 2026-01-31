/**
 * Media serving endpoint for the gateway.
 * Serves files from ~/.openclaw/media/inbound/ (voice messages, images, etc.)
 * so the web UI can render audio players instead of raw binary.
 *
 * Route: GET /api/media/:filename
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

import { getMediaDir } from "../media/store.js";
import { authorizeGatewayConnect, isLocalDirectRequest, type ResolvedGatewayAuth } from "./auth.js";
import { sendText, sendUnauthorized } from "./http-common.js";
import { getBearerToken } from "./http-utils.js";
import { loadConfig } from "../config/config.js";

const MIME_BY_EXT: Record<string, string> = {
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
};

const PREFIX = "/api/media/";

/**
 * Validate that a filename is safe (no path traversal).
 * Only bare filenames allowed — no slashes, no "..", no null bytes.
 */
function isSafeFilename(name: string): boolean {
  if (!name) return false;
  if (name.includes("/") || name.includes("\\")) return false;
  if (name.includes("..")) return false;
  if (name.includes("\0")) return false;
  if (name === "." || name === "..") return false;
  return true;
}

function resolveContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

export async function handleMediaHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: { auth: ResolvedGatewayAuth; trustedProxies?: string[] },
): Promise<boolean> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`);
  if (!url.pathname.startsWith(PREFIX)) return false;

  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    sendText(res, 405, "Method Not Allowed");
    return true;
  }

  // Auth: allow local direct requests (same-origin from UI) without token.
  // Remote requests require Bearer token or query param.
  const cfg = loadConfig();
  const trustedProxies = opts.trustedProxies ?? cfg.gateway?.trustedProxies;
  const isLocal = isLocalDirectRequest(req, trustedProxies);

  if (!isLocal) {
    const token = getBearerToken(req) ?? url.searchParams.get("token") ?? undefined;
    const authResult = await authorizeGatewayConnect({
      auth: opts.auth,
      connectAuth: token ? { token, password: token } : null,
      req,
      trustedProxies,
    });
    if (!authResult.ok) {
      sendUnauthorized(res);
      return true;
    }
  }

  const filename = decodeURIComponent(url.pathname.slice(PREFIX.length));
  if (!isSafeFilename(filename)) {
    sendText(res, 400, "Invalid filename");
    return true;
  }

  // Try inbound first, then outbound
  const mediaDir = getMediaDir();
  const inboundPath = path.join(mediaDir, "inbound", filename);
  const outboundPath = path.join(mediaDir, "outbound", filename);

  let filePath: string | null = null;
  for (const candidate of [inboundPath, outboundPath]) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) {
        filePath = candidate;
        break;
      }
    } catch {
      // Not found, try next
    }
  }

  if (!filePath) {
    sendText(res, 404, "Not Found");
    return true;
  }

  const contentType = resolveContentType(filename);
  const stat = await fs.stat(filePath);

  res.statusCode = 200;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Length", stat.size);
  res.setHeader("Cache-Control", "private, max-age=3600");

  const data = await fs.readFile(filePath);
  res.end(data);
  return true;
}
