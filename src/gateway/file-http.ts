/**
 * File read endpoint for the gateway.
 * Serves text file contents by absolute path so the web UI
 * artifact panel can preview files written/edited by agents.
 *
 * Route: GET /api/file/read?path=<absolute-path>
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { loadConfig } from "../config/config.js";
import { authorizeGatewayConnect, isLocalDirectRequest, type ResolvedGatewayAuth } from "./auth.js";
import { sendJson, sendText, sendUnauthorized } from "./http-common.js";
import { getBearerToken } from "./http-utils.js";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

const READ_PREFIX = "/api/file/read";
const WRITE_PREFIX = "/api/file/write";
const MAX_FILE_SIZE = 512 * 1024; // 512 KB

/** Extensions that are definitely binary — skip reading. */
const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".ico",
  ".svg",
  ".mp3",
  ".mp4",
  ".m4a",
  ".ogg",
  ".wav",
  ".flac",
  ".aac",
  ".opus",
  ".zip",
  ".gz",
  ".tar",
  ".bz2",
  ".xz",
  ".7z",
  ".rar",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".dat",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".sqlite",
  ".db",
]);

function isBinaryExtension(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Check first bytes for null characters (binary indicator).
 * Reads up to 8KB and checks for null bytes.
 */
function looksLikeBinary(buffer: Buffer): boolean {
  const check = Math.min(buffer.length, 8192);
  for (let i = 0; i < check; i++) {
    if (buffer[i] === 0) {
      return true;
    }
  }
  return false;
}

function resolvePath(raw: string): string {
  if (raw.startsWith("~")) {
    return path.join(os.homedir(), raw.slice(1));
  }
  // Resolve relative paths against the default agent's workspace directory
  if (!path.isAbsolute(raw)) {
    const cfg = loadConfig();
    const defaultAgentId = resolveDefaultAgentId(cfg);
    const workspaceDir = resolveAgentWorkspaceDir(cfg, defaultAgentId);
    return path.resolve(workspaceDir, raw);
  }
  return raw;
}

export async function handleFileHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: { auth: ResolvedGatewayAuth; trustedProxies?: string[] },
): Promise<boolean> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`);
  const isRead = url.pathname === READ_PREFIX;
  const isWrite = url.pathname === WRITE_PREFIX;
  if (!isRead && !isWrite) {
    return false;
  }

  if (isRead && req.method !== "GET") {
    sendText(res, 405, "Method Not Allowed");
    return true;
  }
  if (isWrite && req.method !== "POST") {
    sendText(res, 405, "Method Not Allowed");
    return true;
  }

  // Auth: allow local direct requests without token
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

  // ── Write handler ──
  if (isWrite) {
    const body = await readBody(req);
    let parsed: { path?: string; content?: string };
    try {
      parsed = JSON.parse(body);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON" });
      return true;
    }
    if (!parsed.path || typeof parsed.content !== "string") {
      sendJson(res, 400, { error: "Missing 'path' or 'content' in body" });
      return true;
    }
    const wp = resolvePath(parsed.path);
    if (!path.isAbsolute(wp)) {
      sendJson(res, 400, { error: "Path must be absolute" });
      return true;
    }
    try {
      await fs.mkdir(path.dirname(wp), { recursive: true });
      await fs.writeFile(wp, parsed.content, "utf-8");
      const stat = await fs.stat(wp);
      sendJson(res, 200, { ok: true, size: stat.size, mtime: stat.mtimeMs });
    } catch (err: unknown) {
      sendJson(res, 500, {
        error: `Write failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    return true;
  }

  // ── Read handler ──
  const rawPath = url.searchParams.get("path");
  if (!rawPath) {
    sendJson(res, 400, { error: "Missing 'path' query parameter" });
    return true;
  }

  const filePath = resolvePath(rawPath);

  if (!path.isAbsolute(filePath)) {
    sendJson(res, 400, { error: "Path must be absolute" });
    return true;
  }

  // Reject binary by extension
  if (isBinaryExtension(filePath)) {
    sendJson(res, 400, { error: "Binary files cannot be previewed" });
    return true;
  }

  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(filePath);
  } catch {
    sendJson(res, 404, { error: "File not found" });
    return true;
  }

  if (!stat.isFile()) {
    sendJson(res, 400, { error: "Path is not a file" });
    return true;
  }

  const size = stat.size;
  const mtime = stat.mtimeMs;
  const truncated = size > MAX_FILE_SIZE;

  let buffer: Buffer;
  try {
    if (truncated) {
      // Read only first MAX_FILE_SIZE bytes
      const fh = await fs.open(filePath, "r");
      try {
        buffer = Buffer.alloc(MAX_FILE_SIZE);
        await fh.read(buffer, 0, MAX_FILE_SIZE, 0);
      } finally {
        await fh.close();
      }
    } else {
      buffer = await fs.readFile(filePath);
    }
  } catch {
    sendJson(res, 500, { error: "Failed to read file" });
    return true;
  }

  // Check for binary content
  if (looksLikeBinary(buffer)) {
    sendJson(res, 400, { error: "Binary files cannot be previewed" });
    return true;
  }

  const content = buffer.toString("utf-8");

  sendJson(res, 200, { content, size, mtime, truncated });
  return true;
}
