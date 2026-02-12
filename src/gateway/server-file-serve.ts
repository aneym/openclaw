/**
 * File serving endpoint for the gateway.
 * Serves files (images, PDFs, text) by absolute path so the webchat
 * can render inline previews, image thumbnails, and download links.
 *
 * Route: GET /api/files?path=<absolute-path>
 *
 * Auth: Bearer token or ?token= query param.
 * Security: Only regular files, no directories. Path traversal rejected.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../config/config.js";
import { detectMime } from "../media/mime.js";
import { authorizeGatewayConnect, type ResolvedGatewayAuth } from "./auth.js";
import { sendJson, sendText, sendUnauthorized } from "./http-common.js";
import { getBearerToken } from "./http-utils.js";

const PREFIX = "/api/files";

/** MIME fallback for extensions not detected by file-type sniffing. */
const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".webm": "video/webm",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".oga": "audio/ogg",
  ".flac": "audio/flac",
  ".pdf": "application/pdf",
  ".json": "application/json",
  ".txt": "text/plain",
  ".md": "text/markdown",
};

/** Allowed file extensions for serving. */
const ALLOWED_EXTENSIONS = new Set(Object.keys(MIME_BY_EXT));

/** Maximum file size to serve (50 MB). */
const MAX_SERVE_SIZE = 50 * 1024 * 1024;

/**
 * Resolve allowlisted roots once:
 * - home directory
 * - OS temp directory
 * - common macOS temp aliases
 */
let allowedRootsPromise: Promise<string[]> | null = null;

function isPathWithinRoot(filePath: string, root: string): boolean {
  const relative = path.relative(root, filePath);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

function isAllowedPath(filePath: string, allowedRoots: string[]): boolean {
  return allowedRoots.some((root) => isPathWithinRoot(filePath, root));
}

async function resolveRootCandidates(): Promise<string[]> {
  const candidates = [os.homedir(), os.tmpdir(), "/tmp", "/var/folders"];
  const roots = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const resolved = path.resolve(candidate);
    roots.add(resolved);
    try {
      roots.add(await fs.realpath(resolved));
    } catch {
      // Some aliases may not exist on all platforms.
    }
  }
  return [...roots];
}

async function getAllowedRoots(): Promise<string[]> {
  if (!allowedRootsPromise) {
    allowedRootsPromise = resolveRootCandidates();
  }
  return await allowedRootsPromise;
}

export async function handleFileServeHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: { auth: ResolvedGatewayAuth; trustedProxies?: string[] },
): Promise<boolean> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`);
  if (url.pathname !== PREFIX) {
    return false;
  }

  if (req.method !== "GET") {
    sendText(res, 405, "Method Not Allowed");
    return true;
  }

  // Auth: always require gateway credentials for file serving.
  const cfg = loadConfig();
  const trustedProxies = opts.trustedProxies ?? cfg.gateway?.trustedProxies;
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

  const rawPath = url.searchParams.get("path")?.trim();
  if (!rawPath) {
    sendJson(res, 400, { error: "Missing 'path' query parameter" });
    return true;
  }

  if (rawPath.includes("\0")) {
    sendJson(res, 400, { error: "Invalid path" });
    return true;
  }

  if (!path.isAbsolute(rawPath)) {
    sendJson(res, 400, { error: "Path must be absolute" });
    return true;
  }
  const filePath = path.resolve(rawPath);

  // Security: restrict to allowed locations
  const allowedRoots = await getAllowedRoots();
  if (!isAllowedPath(filePath, allowedRoots)) {
    sendJson(res, 403, { error: "Path outside allowed directories" });
    return true;
  }

  // Check extension
  const ext = path.extname(filePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    sendJson(res, 400, {
      error: `File type not supported: ${ext || "(none)"}`,
    });
    return true;
  }

  // Stat the file
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

  if (stat.size > MAX_SERVE_SIZE) {
    sendJson(res, 400, { error: "File too large" });
    return true;
  }

  // Resolve symlinks and enforce allowlist on the canonical path as well.
  let realFilePath: string;
  try {
    realFilePath = await fs.realpath(filePath);
  } catch {
    sendJson(res, 404, { error: "File not found" });
    return true;
  }
  if (!isAllowedPath(realFilePath, allowedRoots)) {
    sendJson(res, 403, { error: "Path outside allowed directories" });
    return true;
  }

  // Detect MIME type
  let headBuffer: Buffer | undefined;
  if (stat.size > 0) {
    const headSize = Math.min(4096, stat.size);
    try {
      const fh = await fs.open(filePath, "r");
      try {
        headBuffer = Buffer.alloc(headSize);
        await fh.read(headBuffer, 0, headBuffer.length, 0);
      } finally {
        await fh.close();
      }
    } catch {
      // Keep extension fallback below.
    }
  }

  const resolvedContentType =
    (await detectMime({ buffer: headBuffer, filePath })) ??
    MIME_BY_EXT[ext] ??
    "application/octet-stream";

  // Stream the file
  res.statusCode = 200;
  res.setHeader("Content-Type", resolvedContentType);
  res.setHeader("Content-Length", stat.size);
  res.setHeader("Cache-Control", "private, max-age=3600");

  const stream = createReadStream(filePath);
  stream.pipe(res);
  stream.on("error", () => {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end("Read error");
    } else {
      res.end();
    }
  });

  return true;
}
