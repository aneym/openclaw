import { html, nothing } from "lit";
import { icons } from "../icons";
import { openImageLightbox, openMediaLightbox } from "./image-lightbox";
import { extractImagePathsFromText, extractMediaLines, isImagePath } from "./media-paths";
import { extractTextCached } from "./message-extract";

const EXEC_TOOL_NAMES = new Set(["exec", "bash", "process"]);
const LEGACY_IMAGE_TOOL_NAMES = new Set(["read", "image", "nano-banana-pro"]);
const ASSET_TOOL_NAMES = new Set([
  "display_asset",
  "display-asset",
  "display_image",
  "display-image",
  "show_image",
  "show-image",
  ...LEGACY_IMAGE_TOOL_NAMES,
]);

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|svg)(?:[?#].*)?$/i;
const VIDEO_EXT_RE = /\.(mp4|mov|m4v|webm|avi|mkv)(?:[?#].*)?$/i;
const AUDIO_EXT_RE = /\.(mp3|wav|m4a|aac|ogg|opus|flac|oga)(?:[?#].*)?$/i;
const TAGGED_ASSET_RE = /^\s*(MEDIA|FILE|ASSET):\s*(.+?)\s*$/i;

type AssetKind = "image" | "video" | "audio" | "file";

type ToolResultEntry = {
  name: string;
  text: string;
  callArgs?: unknown;
  rawResult?: unknown;
};

type AssetRef = {
  path: string;
  kind: AssetKind;
  mimeType?: string;
};

type ToolRenderContext = {
  resolveFileUrl?: (filePath: string) => string;
};

type ToolRenderResult = {
  content: unknown;
  hasMediaPreview: boolean;
};

type ToolRenderer = (entry: ToolResultEntry, ctx: ToolRenderContext) => ToolRenderResult;

type ToolRegistryEntry = {
  matches: (toolName: string) => boolean;
  render: ToolRenderer;
};

const registry: ToolRegistryEntry[] = [
  {
    matches: (toolName) => EXEC_TOOL_NAMES.has(toolName),
    render: renderExecToolResult,
  },
  {
    matches: (toolName) => ASSET_TOOL_NAMES.has(toolName),
    render: renderAssetToolResult,
  },
];

function normalizeToolName(name: string): string {
  return name.trim().toLowerCase();
}

function formatMaybeJson(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return text;
  }
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return text;
  }
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return text;
  }
}

function firstString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function basename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const name = normalized.split("/").pop();
  return name && name.trim().length > 0 ? name : "asset";
}

function resolveAssetUrl(assetPath: string, ctx: ToolRenderContext): string {
  if (
    assetPath.startsWith("http://") ||
    assetPath.startsWith("https://") ||
    assetPath.startsWith("data:")
  ) {
    return assetPath;
  }
  if (ctx.resolveFileUrl) {
    return ctx.resolveFileUrl(assetPath);
  }
  return `/api/files?path=${encodeURIComponent(assetPath)}`;
}

function normalizePathCandidate(raw: string): string | null {
  let value = raw.trim();
  if (!value) {
    return null;
  }

  while (value.length > 0 && "`\"'(<[".includes(value[0] ?? "")) {
    value = value.slice(1);
  }
  while (value.length > 0 && "`\"')>],;:.".includes(value.at(-1) ?? "")) {
    value = value.slice(0, -1);
  }
  if (!value) {
    return null;
  }

  if (/^file:\/\//i.test(value)) {
    try {
      const fileUrl = new URL(value);
      return decodeURIComponent(fileUrl.pathname);
    } catch {
      return null;
    }
  }

  return value;
}

function inferKindFromPath(filePath: string): AssetKind {
  if (IMAGE_EXT_RE.test(filePath)) {
    return "image";
  }
  if (VIDEO_EXT_RE.test(filePath)) {
    return "video";
  }
  if (AUDIO_EXT_RE.test(filePath)) {
    return "audio";
  }
  return "file";
}

function inferKindFromMime(mimeType: string | null | undefined): AssetKind | null {
  if (!mimeType) {
    return null;
  }
  const normalized = mimeType.toLowerCase();
  if (normalized.startsWith("image/")) {
    return "image";
  }
  if (normalized.startsWith("video/")) {
    return "video";
  }
  if (normalized.startsWith("audio/")) {
    return "audio";
  }
  return null;
}

function parseTaggedAssetLines(text: string): Array<{ path: string; kindHint?: AssetKind }> {
  const assets: Array<{ path: string; kindHint?: AssetKind }> = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(TAGGED_ASSET_RE);
    if (!match) {
      continue;
    }
    const normalized = normalizePathCandidate(match[2] ?? "");
    if (!normalized) {
      continue;
    }
    const tag = (match[1] ?? "").toUpperCase();
    assets.push({
      path: normalized,
      kindHint: tag === "MEDIA" ? "image" : undefined,
    });
  }
  return assets;
}

function extractToolCallPath(args: unknown): string | null {
  if (!args || typeof args !== "object") {
    return null;
  }
  const record = args as Record<string, unknown>;
  const value =
    firstString(record.path) ??
    firstString(record.file_path) ??
    firstString(record.output_path) ??
    firstString(record.filename);
  return value ? normalizePathCandidate(value) : null;
}

function extractToolCallKind(args: unknown): AssetKind | undefined {
  if (!args || typeof args !== "object") {
    return undefined;
  }
  const record = args as Record<string, unknown>;
  const value =
    firstString(record.kind) ??
    firstString(record.assetKind) ??
    firstString(record.asset_kind) ??
    firstString(record.type);
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "image" || normalized === "video" || normalized === "audio") {
    return normalized;
  }
  return undefined;
}

function extractToolCallMimeType(args: unknown): string | undefined {
  if (!args || typeof args !== "object") {
    return undefined;
  }
  const record = args as Record<string, unknown>;
  return firstString(record.mimeType) ?? firstString(record.mime_type) ?? undefined;
}

function extractResultPath(result: unknown): string | null {
  if (!result || typeof result !== "object") {
    return null;
  }
  const record = result as Record<string, unknown>;
  const value =
    firstString(record.path) ??
    firstString(record.file_path) ??
    firstString(record.output_path) ??
    firstString(record.filename);
  return value ? normalizePathCandidate(value) : null;
}

function extractResultMimeType(result: unknown): string | undefined {
  if (!result || typeof result !== "object") {
    return undefined;
  }
  const record = result as Record<string, unknown>;
  return firstString(record.mimeType) ?? firstString(record.mime_type) ?? undefined;
}

function resolveAssetKind(params: {
  path: string;
  callKind?: AssetKind;
  callMimeType?: string;
  resultMimeType?: string;
  textHintKind?: AssetKind;
}): AssetKind {
  if (params.textHintKind) {
    return params.textHintKind;
  }
  if (params.callKind) {
    return params.callKind;
  }
  const fromMime = inferKindFromMime(params.callMimeType ?? params.resultMimeType);
  if (fromMime) {
    return fromMime;
  }
  return inferKindFromPath(params.path);
}

function pushAsset(list: AssetRef[], next: AssetRef): void {
  const existingIndex = list.findIndex((asset) => asset.path === next.path);
  if (existingIndex === -1) {
    list.push(next);
    return;
  }
  const existing = list[existingIndex];
  if (!existing) {
    return;
  }
  if (existing.kind === "file" && next.kind !== "file") {
    list[existingIndex] = next;
    return;
  }
  if (!existing.mimeType && next.mimeType) {
    list[existingIndex] = { ...existing, mimeType: next.mimeType };
  }
}

function collectAssets(entry: ToolResultEntry): AssetRef[] {
  const assets: AssetRef[] = [];
  const callPath = extractToolCallPath(entry.callArgs);
  const callKind = extractToolCallKind(entry.callArgs);
  const callMimeType = extractToolCallMimeType(entry.callArgs);
  const resultPath = extractResultPath(entry.rawResult);
  const resultMimeType = extractResultMimeType(entry.rawResult);

  if (callPath) {
    pushAsset(assets, {
      path: callPath,
      kind: resolveAssetKind({ path: callPath, callKind, callMimeType, resultMimeType }),
      mimeType: callMimeType ?? resultMimeType,
    });
  }

  if (resultPath) {
    pushAsset(assets, {
      path: resultPath,
      kind: resolveAssetKind({ path: resultPath, callKind, callMimeType, resultMimeType }),
      mimeType: callMimeType ?? resultMimeType,
    });
  }

  for (const tagged of parseTaggedAssetLines(entry.text)) {
    pushAsset(assets, {
      path: tagged.path,
      kind: resolveAssetKind({
        path: tagged.path,
        callKind,
        callMimeType,
        resultMimeType,
        textHintKind: tagged.kindHint,
      }),
      mimeType: callMimeType ?? resultMimeType,
    });
  }

  if (LEGACY_IMAGE_TOOL_NAMES.has(normalizeToolName(entry.name))) {
    for (const imagePath of extractImagePathsFromText(entry.text)) {
      if (!isImagePath(imagePath)) {
        continue;
      }
      pushAsset(assets, {
        path: imagePath,
        kind: "image",
        mimeType: callMimeType ?? resultMimeType,
      });
    }
  }

  return assets;
}

function extractExecCommand(args: unknown): string | null {
  if (!args || typeof args !== "object") {
    return null;
  }
  const record = args as Record<string, unknown>;
  return firstString(record.command) ?? firstString(record.cmd);
}

function detectExitCode(output: string): number | null {
  const patterns = [
    /(?:^|\b)exit(?:\s*code)?\s*[:=]\s*(-?\d+)\b/i,
    /"exitCode"\s*:\s*(-?\d+)\b/,
    /\bcode\s*[:=]\s*(-?\d+)\b/i,
  ];
  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (!match) {
      continue;
    }
    const parsed = Number.parseInt(match[1] ?? "", 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
}

function copyValueLabel(pathValue: string): string {
  return pathValue.startsWith("http://") || pathValue.startsWith("https://")
    ? "Copy link"
    : "Copy path";
}

async function copyImageToClipboard(imageUrl: string, fallbackText: string): Promise<void> {
  try {
    const blob = await fetch(imageUrl).then((res) => res.blob());
    const clipboardItemCtor = (globalThis as { ClipboardItem?: typeof ClipboardItem })
      .ClipboardItem;
    if (!navigator.clipboard || !clipboardItemCtor) {
      await navigator.clipboard.writeText(fallbackText);
      return;
    }
    await navigator.clipboard.write([new clipboardItemCtor({ [blob.type]: blob })]);
  } catch {
    try {
      await navigator.clipboard.writeText(fallbackText);
    } catch {
      // no-op
    }
  }
}

function downloadAsset(assetUrl: string, assetPath: string): void {
  const anchor = document.createElement("a");
  anchor.href = assetUrl;
  anchor.download = basename(assetPath);
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function renderAssetActions(asset: AssetRef, assetUrl: string, extra?: unknown) {
  const copyLabel = copyValueLabel(asset.path);
  return html`
    <div class="chat-tool-image-preview__actions">
      ${extra ?? nothing}
      ${
        asset.kind === "image"
          ? html`<button
              type="button"
              class="chat-tool-action-btn"
              title="Copy image"
              @click=${() => void copyImageToClipboard(assetUrl, asset.path)}
            >
              ${icons.copy}<span>Copy</span>
            </button>`
          : nothing
      }
      <button
        type="button"
        class="chat-tool-action-btn"
        title="Download"
        @click=${() => downloadAsset(assetUrl, asset.path)}
      >
        ${icons.fileText}<span>Download</span>
      </button>
      <button
        type="button"
        class="chat-tool-action-btn"
        title=${copyLabel}
        @click=${() => void navigator.clipboard.writeText(asset.path)}
      >
        ${icons.link}<span>${copyLabel}</span>
      </button>
    </div>
  `;
}

function renderAssetMeta(asset: AssetRef) {
  const fileName = basename(asset.path);
  return html`
    <div class="chat-tool-image-preview__meta">
      <span class="chat-tool-image-preview__name">${fileName}</span>
      <span class="chat-tool-image-preview__path">${asset.path}</span>
    </div>
  `;
}

function renderImagePreview(asset: AssetRef, ctx: ToolRenderContext) {
  const assetUrl = resolveAssetUrl(asset.path, ctx);
  const fileName = basename(asset.path);
  return html`
    <figure class="chat-tool-image-preview">
      <div
        class="chat-tool-image-preview__thumb"
        tabindex="0"
        title="Image preview (double-click to expand)"
      >
        <img
          src=${assetUrl}
          alt=${fileName}
          loading="lazy"
          @dblclick=${() => openImageLightbox(assetUrl, fileName)}
        />
      </div>
      <figcaption class="chat-tool-image-preview__overlay">
        ${renderAssetMeta(asset)}
        ${renderAssetActions(
          asset,
          assetUrl,
          html`<button
            type="button"
            class="chat-tool-action-btn"
            title="Expand image"
            @click=${() => openImageLightbox(assetUrl, fileName)}
          >
            ${icons.image}<span>Expand</span>
          </button>`,
        )}
      </figcaption>
    </figure>
  `;
}

function renderVideoPreview(asset: AssetRef, ctx: ToolRenderContext) {
  const assetUrl = resolveAssetUrl(asset.path, ctx);
  const fileName = basename(asset.path);
  return html`
    <figure class="chat-tool-video-preview">
      <video
        class="chat-tool-video-preview__player"
        controls
        preload="metadata"
        src=${assetUrl}
        @dblclick=${() => openMediaLightbox({ kind: "video", src: assetUrl, alt: fileName })}
      ></video>
      <figcaption class="chat-tool-video-preview__footer">
        ${renderAssetMeta(asset)}
        ${renderAssetActions(
          asset,
          assetUrl,
          html`<button
            type="button"
            class="chat-tool-action-btn"
            title="Expand video"
            @click=${() => openMediaLightbox({ kind: "video", src: assetUrl, alt: fileName })}
          >
            ${icons.image}<span>Expand</span>
          </button>`,
        )}
      </figcaption>
    </figure>
  `;
}

function renderAudioPreview(asset: AssetRef, ctx: ToolRenderContext) {
  const assetUrl = resolveAssetUrl(asset.path, ctx);
  return html`
    <figure class="chat-tool-audio-preview">
      ${renderAssetMeta(asset)}
      <audio controls preload="metadata" src=${assetUrl}></audio>
      ${renderAssetActions(asset, assetUrl)}
    </figure>
  `;
}

function renderFilePreview(asset: AssetRef, ctx: ToolRenderContext) {
  const assetUrl = resolveAssetUrl(asset.path, ctx);
  return html`
    <figure class="chat-tool-file-preview">
      <div class="chat-tool-file-preview__header">
        <span class="chat-tool-file-preview__icon">${icons.fileText}</span>
        ${renderAssetMeta(asset)}
      </div>
      ${renderAssetActions(asset, assetUrl)}
    </figure>
  `;
}

function renderAssetPreview(asset: AssetRef, ctx: ToolRenderContext) {
  if (asset.kind === "image") {
    return renderImagePreview(asset, ctx);
  }
  if (asset.kind === "video") {
    return renderVideoPreview(asset, ctx);
  }
  if (asset.kind === "audio") {
    return renderAudioPreview(asset, ctx);
  }
  return renderFilePreview(asset, ctx);
}

function renderAssetGrid(assets: AssetRef[], ctx: ToolRenderContext) {
  if (assets.length === 0) {
    return nothing;
  }
  return html`
    <div class="chat-tool-asset-grid">
      ${assets.map((asset) => renderAssetPreview(asset, ctx))}
    </div>
  `;
}

function renderAssetToolResult(entry: ToolResultEntry, ctx: ToolRenderContext): ToolRenderResult {
  const assets = collectAssets(entry);
  if (assets.length === 0) {
    return renderDefaultToolResult(entry, ctx);
  }

  return {
    hasMediaPreview: true,
    content: html`
      <div class="chat-tool-renderer chat-tool-renderer--asset">
        ${renderAssetGrid(assets, ctx)}
      </div>
    `,
  };
}

function renderExecToolResult(entry: ToolResultEntry, _ctx: ToolRenderContext): ToolRenderResult {
  const mediaExtract = extractMediaLines(entry.text);
  const output = mediaExtract.cleanedText;
  const command = extractExecCommand(entry.callArgs);
  const exitCode = detectExitCode(output);

  return {
    hasMediaPreview: false,
    content: html`
      <div class="chat-tool-renderer chat-tool-renderer--exec">
        <div class="chat-tool-exec-header">
          <div class="chat-tool-exec-header__left">
            ${icons.code}
            <span>exec</span>
          </div>
          ${
            exitCode == null
              ? nothing
              : html`<span
                  class="chat-tool-exec-status ${exitCode === 0 ? "chat-tool-exec-status--ok" : "chat-tool-exec-status--error"}"
                >
                  ${exitCode === 0 ? icons.check : icons.x}
                  <span>exit ${exitCode}</span>
                </span>`
          }
        </div>
        ${
          command
            ? html`<pre class="chat-tool-exec-command"><code>${command}</code></pre>`
            : nothing
        }
        ${
          output
            ? html`<pre class="chat-tool-exec-output"><code>${output}</code></pre>`
            : html`
                <div class="chat-tool-exec-empty">No text output.</div>
              `
        }
      </div>
    `,
  };
}

function renderDefaultToolResult(
  entry: ToolResultEntry,
  _ctx: ToolRenderContext,
): ToolRenderResult {
  const formatted = formatMaybeJson(entry.text);
  return {
    hasMediaPreview: false,
    content: html`
      <details class="chat-tool-default">
        <summary class="chat-tool-default__summary">Tool output</summary>
        <pre class="chat-tool-default__output"><code>${formatted || "(empty)"}</code></pre>
      </details>
    `,
  };
}

function renderEntry(entry: ToolResultEntry, ctx: ToolRenderContext): ToolRenderResult {
  const normalized = normalizeToolName(entry.name);
  for (const registryEntry of registry) {
    if (registryEntry.matches(normalized)) {
      return registryEntry.render(entry, ctx);
    }
  }
  return renderDefaultToolResult(entry, ctx);
}

function toolResultText(item: Record<string, unknown>): string {
  if (typeof item.text === "string") {
    return item.text;
  }
  if (typeof item.content === "string") {
    return item.content;
  }
  if (item.result !== undefined) {
    try {
      return JSON.stringify(item.result, null, 2);
    } catch {
      return "[unserializable tool result]";
    }
  }
  return "";
}

export function extractToolResultEntries(message: unknown): ToolResultEntry[] {
  const entries: ToolResultEntry[] = [];
  const m = message as Record<string, unknown>;
  const content = Array.isArray(m.content) ? m.content : null;
  if (content) {
    const callArgsByName = new Map<string, unknown[]>();
    for (const block of content) {
      if (!block || typeof block !== "object") {
        continue;
      }
      const item = block as Record<string, unknown>;
      const kind = typeof item.type === "string" ? item.type.toLowerCase() : "";
      const name = firstString(item.name) ?? "tool";
      if (
        kind === "toolcall" ||
        kind === "tool_call" ||
        kind === "tooluse" ||
        kind === "tool_use"
      ) {
        const key = normalizeToolName(name);
        const queue = callArgsByName.get(key) ?? [];
        queue.push(item.arguments ?? item.args);
        callArgsByName.set(key, queue);
        continue;
      }
      if (kind !== "toolresult" && kind !== "tool_result") {
        continue;
      }
      const key = normalizeToolName(name);
      const queue = callArgsByName.get(key);
      const callArgs = queue?.length ? queue.shift() : undefined;
      entries.push({
        name,
        text: toolResultText(item),
        callArgs,
        rawResult: item.result ?? item.details,
      });
    }
  }

  if (entries.length === 0) {
    const role = firstString(m.role)?.toLowerCase() ?? "";
    const isStandaloneToolResult =
      role === "toolresult" || role === "tool_result" || typeof m.toolCallId === "string";
    if (isStandaloneToolResult) {
      const name = firstString(m.toolName) ?? firstString(m.tool_name) ?? "tool";
      const text = extractTextCached(message) ?? "";
      entries.push({ name, text, rawResult: m.result ?? m.details });
    }
  }

  return entries;
}

export function messageHasRichToolPreview(message: unknown): boolean {
  const entries = extractToolResultEntries(message);
  return entries.some((entry) => {
    const normalized = normalizeToolName(entry.name);
    if (!ASSET_TOOL_NAMES.has(normalized)) {
      return false;
    }
    return collectAssets(entry).length > 0;
  });
}

export function messageHasImageToolPreview(message: unknown): boolean {
  return messageHasRichToolPreview(message);
}

export function renderToolResultEntries(
  message: unknown,
  ctx: ToolRenderContext,
): ToolRenderResult[] {
  const entries = extractToolResultEntries(message);
  return entries.map((entry) => renderEntry(entry, ctx));
}
