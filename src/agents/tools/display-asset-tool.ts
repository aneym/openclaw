import { Type } from "@sinclair/typebox";
import fs from "node:fs/promises";
import path from "node:path";
import type { AnyAgentTool } from "./common.js";
import { detectMime } from "../../media/mime.js";
import { optionalStringEnum } from "../schema/typebox.js";
import { readStringParam } from "./common.js";

const ASSET_KIND_VALUES = ["image", "video", "audio", "file"] as const;
type AssetKind = (typeof ASSET_KIND_VALUES)[number];

const DisplayAssetToolSchema = Type.Object({
  path: Type.String(),
  kind: Type.Optional(optionalStringEnum(ASSET_KIND_VALUES)),
  caption: Type.Optional(Type.String()),
});

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|svg)$/i;
const VIDEO_EXT_RE = /\.(mp4|mov|m4v|webm|avi|mkv)$/i;
const AUDIO_EXT_RE = /\.(mp3|wav|m4a|aac|ogg|opus|flac|oga)$/i;

function isRemotePath(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

function normalizePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("path required");
  }
  if (!trimmed.startsWith("file://")) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    return decodeURIComponent(url.pathname);
  } catch {
    throw new Error("Invalid file:// URL");
  }
}

function inferKindFromPath(filePath: string): AssetKind | null {
  if (IMAGE_EXT_RE.test(filePath)) {
    return "image";
  }
  if (VIDEO_EXT_RE.test(filePath)) {
    return "video";
  }
  if (AUDIO_EXT_RE.test(filePath)) {
    return "audio";
  }
  return null;
}

function inferKindFromMime(mimeType: string | null | undefined): AssetKind | null {
  if (!mimeType) {
    return null;
  }
  const mime = mimeType.toLowerCase();
  if (mime.startsWith("image/")) {
    return "image";
  }
  if (mime.startsWith("video/")) {
    return "video";
  }
  if (mime.startsWith("audio/")) {
    return "audio";
  }
  return null;
}

function parseDataUrlMime(pathValue: string): string | null {
  const match = /^data:([^;]+);base64,/i.exec(pathValue);
  if (!match) {
    return null;
  }
  return match[1]?.trim() || null;
}

async function detectMimeFromFile(filePath: string): Promise<string | null> {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    throw new Error("Path is not a file");
  }
  const headSize = Math.max(1, Math.min(4096, stat.size));
  const fh = await fs.open(filePath, "r");
  try {
    const head = Buffer.alloc(headSize);
    await fh.read(head, 0, head.length, 0);
    return (await detectMime({ buffer: head, filePath })) ?? null;
  } finally {
    await fh.close();
  }
}

function resolveAssetKind(params: {
  requestedPath: string;
  requestedKind?: string;
  detectedMimeType?: string | null;
}): AssetKind {
  const explicit = params.requestedKind?.trim().toLowerCase();
  if (explicit && ASSET_KIND_VALUES.includes(explicit as AssetKind)) {
    return explicit as AssetKind;
  }
  const fromMime = inferKindFromMime(params.detectedMimeType);
  if (fromMime) {
    return fromMime;
  }
  const fromPath = inferKindFromPath(params.requestedPath);
  if (fromPath) {
    return fromPath;
  }
  return "file";
}

export function createDisplayAssetTool(): AnyAgentTool {
  return {
    label: "Display asset",
    name: "display_asset",
    description:
      "Display a local or remote asset in chat (image/video/audio/file) with compact preview controls. Use this after creating or locating an asset file.",
    parameters: DisplayAssetToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const requestedPath = normalizePath(
        readStringParam(params, "path", { required: true, label: "path" }),
      );
      const caption = readStringParam(params, "caption");
      const requestedKind = readStringParam(params, "kind");
      const explicitKind = requestedKind?.trim().toLowerCase() as AssetKind | undefined;
      const localPath = !isRemotePath(requestedPath) && !/^data:[^;]+;base64,/i.test(requestedPath);

      let displayPath = requestedPath;
      let mimeType: string | null = null;
      if (/^data:[^;]+;base64,/i.test(requestedPath)) {
        mimeType = parseDataUrlMime(requestedPath);
      } else if (!isRemotePath(requestedPath)) {
        displayPath = path.resolve(requestedPath);
        mimeType = await detectMimeFromFile(displayPath);
      }

      const assetKind = resolveAssetKind({
        requestedPath: displayPath,
        requestedKind,
        detectedMimeType: mimeType,
      });

      if (explicitKind && ASSET_KIND_VALUES.includes(explicitKind)) {
        const inferredFromMime = inferKindFromMime(mimeType);
        const inferredFromPath = inferKindFromPath(displayPath);
        if (inferredFromMime && inferredFromMime !== explicitKind) {
          throw new Error(
            `Requested kind '${explicitKind}' does not match detected mime type (${mimeType})`,
          );
        }
        if (
          localPath &&
          !inferredFromMime &&
          inferredFromPath !== explicitKind &&
          inferredFromPath !== "file"
        ) {
          throw new Error(`Requested kind '${explicitKind}' does not match file extension`);
        }
        if (
          localPath &&
          explicitKind === "image" &&
          inferredFromPath === "file" &&
          !inferredFromMime
        ) {
          throw new Error("Path must reference an image file");
        }
      }

      const linePrefix = assetKind === "image" ? "MEDIA" : "FILE";
      const lines = [`${linePrefix}:${displayPath}`];
      if (caption) {
        lines.push(caption);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: {
          path: displayPath,
          assetKind,
          ...(caption ? { caption } : {}),
          ...(mimeType ? { mimeType } : {}),
        },
      };
    },
  };
}
