import { html, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import type { AssistantIdentity } from "../assistant-identity";
import type { MessageGroup } from "../types/chat-types";
import { icons } from "../icons";
import { toSanitizedMarkdownHtml } from "../markdown";
import { renderCopyAsMarkdownButton } from "./copy-as-markdown";
import { openImageLightbox } from "./image-lightbox";
import {
  extractInteractiveBlocks,
  formatButtonPayload,
  formatSubmitPayload,
  getBlockState,
  isBlockInteractive,
  markBlockCancelled,
  markBlockSubmitted,
  setBlockValue,
  type InteractiveBlock,
  type InteractiveElement,
} from "./interactive-types";
import { extractMediaLines, isImagePath } from "./media-paths";
import {
  extractTextCached,
  extractThinkingCached,
  normalizeReasoningText,
} from "./message-extract";
import { isToolResultMessage, normalizeRoleForGrouping } from "./message-normalizer";
import {
  extractToolCards,
  renderToolCardSidebar,
  extractFilePathFromCard,
  isFileMutatingTool,
} from "./tool-cards";
import { messageHasRichToolPreview, renderToolResultEntries } from "./tool-renderers";

/** Track which file paths have already been auto-opened to avoid re-render loops. */
const autoOpenedPaths = new Set<string>();

/** Clear auto-opened tracking (call on new user message to allow re-opens). */
export function resetAutoOpenedPaths() {
  autoOpenedPaths.clear();
}

type ImageBlock = {
  url: string;
  alt?: string;
  path?: string;
};

function extractImages(message: unknown): ImageBlock[] {
  const m = message as Record<string, unknown>;
  const content = m.content;
  const images: ImageBlock[] = [];

  if (Array.isArray(content)) {
    for (const block of content) {
      if (typeof block !== "object" || block === null) {
        continue;
      }
      const b = block as Record<string, unknown>;

      if (b.type === "image") {
        // Handle source object format (from sendChatMessage)
        const source = b.source as Record<string, unknown> | undefined;
        if (source?.type === "base64" && typeof source.data === "string") {
          const data = source.data;
          const mediaType = (source.media_type as string) || "image/png";
          // If data is already a data URL, use it directly
          const url = data.startsWith("data:") ? data : `data:${mediaType};base64,${data}`;
          images.push({ url });
        } else if (typeof b.url === "string") {
          images.push({ url: b.url });
        }
      } else if (b.type === "image_url") {
        // OpenAI format
        const imageUrl = b.image_url as Record<string, unknown> | undefined;
        if (typeof imageUrl?.url === "string") {
          images.push({ url: imageUrl.url });
        }
      }
    }
  }

  return images;
}

type AudioBlock = {
  filename: string;
  url: string;
};

type AudioExtraction = {
  audioFiles: AudioBlock[];
  cleanedText: string;
};

const AUDIO_EXTS = new Set([".ogg", ".mp3", ".m4a", ".wav", ".aac", ".opus", ".flac", ".oga"]);

// Match <file name="..." mime="...">BINARY</file> — binary can be anything
const FILE_TAG_RE = /<file\s+name="([^"]+)"\s+mime="([^"]*)">\s*[\s\S]*?<\/file>/gi;
const MEDIA_AUDIO_RE = /^<media:audio>\s*/i;
const TRANSCRIPT_RE = /^\s*Transcript:\s*/i;

function hasAudioExtension(filename: string): boolean {
  const dotIdx = filename.lastIndexOf(".");
  if (dotIdx === -1) {
    return false;
  }
  return AUDIO_EXTS.has(filename.slice(dotIdx).toLowerCase());
}

/**
 * Extract audio file references from message text that contains
 * `<file name="..." mime="...">BINARY</file>` tags.
 * Returns the audio files and text with binary stripped out.
 */
function extractAudioFromText(text: string): AudioExtraction {
  const audioFiles: AudioBlock[] = [];
  let cleaned = text;

  cleaned = cleaned.replace(FILE_TAG_RE, (_match, name: string, mime: string) => {
    const isAudio =
      (typeof mime === "string" && mime.startsWith("audio/")) || hasAudioExtension(name);
    if (isAudio) {
      audioFiles.push({
        filename: name,
        url: `/api/media/${encodeURIComponent(name)}`,
      });
      return "";
    }
    return _match;
  });

  // Strip <media:audio> prefix
  cleaned = cleaned.replace(MEDIA_AUDIO_RE, "");
  // Strip "Transcript:" label
  cleaned = cleaned.replace(TRANSCRIPT_RE, "");

  return { audioFiles, cleanedText: cleaned.trim() };
}

function renderAudioPlayers(audioFiles: AudioBlock[]) {
  if (audioFiles.length === 0) {
    return nothing;
  }
  return html`
    <div class="chat-audio-players">
      ${audioFiles.map(
        (af) => html`
          <div class="chat-audio-player">
            <audio controls preload="metadata" src=${af.url}></audio>
          </div>
        `,
      )}
    </div>
  `;
}

// ── Interactive Component Rendering ─────────────────────────────────────────

/**
 * Dispatch a custom event to send an interactive submission as a chat message.
 * The event bubbles up to the chat view which handles sending.
 */
function dispatchInteractiveSubmit(target: EventTarget, payload: string): void {
  target.dispatchEvent(
    new CustomEvent("interactive-submit", {
      bubbles: true,
      composed: true,
      detail: { payload },
    }),
  );
}

/**
 * Render a single checkbox element.
 */
function renderCheckboxElement(
  block: InteractiveBlock,
  el: Extract<InteractiveElement, { kind: "checkbox" }>,
  state: ReturnType<typeof getBlockState>,
  disabled: boolean,
): unknown {
  const checked = Boolean(state.values[el.id]);
  const isDisabled = disabled || el.disabled;

  const handleChange = (e: Event) => {
    const input = e.target as HTMLInputElement;
    setBlockValue(block.id, el.id, input.checked);
    // Force re-render by dispatching a no-op event
    input.dispatchEvent(new CustomEvent("interactive-update", { bubbles: true }));
  };

  return html`
    <label class="interactive-checkbox ${isDisabled ? "interactive-checkbox--disabled" : ""}">
      <input
        type="checkbox"
        class="interactive-checkbox__input"
        .checked=${checked}
        ?disabled=${isDisabled}
        @change=${handleChange}
      />
      <span class="interactive-checkbox__label">${el.label}</span>
    </label>
  `;
}

/**
 * Render a single button element.
 */
function renderButtonElement(
  block: InteractiveBlock,
  el: Extract<InteractiveElement, { kind: "button" }>,
  disabled: boolean,
): unknown {
  const styleClass = el.style ? `interactive-button--${el.style}` : "";

  const handleClick = (e: Event) => {
    if (disabled) {
      return;
    }
    const payload = formatButtonPayload(block.id, el.id);
    dispatchInteractiveSubmit(e.target as EventTarget, payload);
  };

  return html`
    <button
      type="button"
      class="interactive-button ${styleClass}"
      ?disabled=${disabled}
      @click=${handleClick}
    >
      ${el.label}
    </button>
  `;
}

/**
 * Render a single interactive element based on its kind.
 * M1+M2: Only checkbox and button are implemented.
 */
function renderInteractiveElement(
  block: InteractiveBlock,
  el: InteractiveElement,
  state: ReturnType<typeof getBlockState>,
  disabled: boolean,
): unknown {
  switch (el.kind) {
    case "checkbox":
      return renderCheckboxElement(block, el, state, disabled);
    case "button":
      return renderButtonElement(block, el, disabled);
    // M3: radio, select, text elements
    default:
      return nothing;
  }
}

/**
 * Render a complete interactive block with elements and Done/Cancel buttons.
 */
function renderInteractiveBlock(block: InteractiveBlock): unknown {
  const state = getBlockState(block);
  const isInteractive = isBlockInteractive(block.id);
  const disabled = !isInteractive;

  const submitLabel = block.submitLabel ?? "Done";
  const cancelLabel = block.cancelLabel ?? "Cancel";

  // Group elements by kind for better layout
  const checkboxes = block.elements.filter((el) => el.kind === "checkbox");
  const buttons = block.elements.filter((el) => el.kind === "button");

  const handleSubmit = (e: Event) => {
    markBlockSubmitted(block.id);
    const payload = formatSubmitPayload(block.id, state.values);
    dispatchInteractiveSubmit(e.target as EventTarget, payload);
  };

  const handleCancel = (e: Event) => {
    markBlockCancelled(block.id);
    // Force re-render
    (e.target as HTMLElement).dispatchEvent(
      new CustomEvent("interactive-update", { bubbles: true }),
    );
  };

  // Determine block state class
  const stateClass = state.submitted
    ? "interactive-block--submitted"
    : state.cancelled
      ? "interactive-block--cancelled"
      : "";

  return html`
    <div class="interactive-block ${stateClass} ${disabled ? "interactive-block--disabled" : ""}">
      <div class="interactive-elements">
        ${checkboxes.map((el) => renderInteractiveElement(block, el, state, disabled))}
        ${
          buttons.length > 0
            ? html`<div class="interactive-buttons">
              ${buttons.map((el) => renderInteractiveElement(block, el, state, disabled))}
            </div>`
            : nothing
        }
      </div>

      ${
        isInteractive
          ? html`
            <div class="interactive-actions">
              <button
                type="button"
                class="interactive-actions__btn interactive-actions__btn--cancel"
                @click=${handleCancel}
              >
                ${cancelLabel}
              </button>
              <button
                type="button"
                class="interactive-actions__btn interactive-actions__btn--submit"
                @click=${handleSubmit}
              >
                ${submitLabel}
              </button>
            </div>
          `
          : html`
            <div class="interactive-status ${state.submitted ? "interactive-status--submitted" : "interactive-status--cancelled"}">
              ${state.submitted ? "Submitted" : "Cancelled"}
            </div>
          `
      }
    </div>
  `;
}

export function renderReadingIndicatorGroup(assistant?: AssistantIdentity) {
  return html`
    <div class="chat-group assistant">
      ${renderAvatar("assistant", assistant)}
      <div class="chat-group-messages">
        <div class="chat-bubble chat-reading-indicator" aria-hidden="true">
          <span class="chat-reading-indicator__dots">
            <span></span><span></span><span></span>
          </span>
        </div>
      </div>
    </div>
  `;
}

export function renderStreamingGroup(
  text: string,
  reasoning: string | undefined,
  startedAt: number,
  showReasoning: boolean,
  onOpenSidebar?: (content: string) => void,
  assistant?: AssistantIdentity,
  onOpenFilePreview?: (filePath: string) => void,
  onOpenCodingSession?: () => void,
  resolveFileUrl?: (filePath: string) => string,
) {
  const timestamp = new Date(startedAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const name = assistant?.name ?? "Assistant";
  const streamingReasoning =
    showReasoning && typeof reasoning === "string" ? normalizeReasoningText(reasoning) : "";

  return html`
    <div class="chat-group assistant">
      ${renderAvatar("assistant", assistant)}
      <div class="chat-group-messages">
        ${streamingReasoning ? renderReasoningPanel(streamingReasoning) : nothing}
        ${renderGroupedMessage(
          {
            role: "assistant",
            content: [{ type: "text", text }],
            timestamp: startedAt,
          },
          { isStreaming: true, showReasoning: false },
          onOpenSidebar,
          onOpenFilePreview,
          onOpenCodingSession,
          resolveFileUrl,
        )}
        <div class="chat-streaming-indicator" aria-hidden="true">
          <span class="chat-streaming-indicator__dots"><span></span><span></span><span></span></span>
        </div>
        <div class="chat-group-footer">
          <span class="chat-sender-name">${name}</span>
          <span class="chat-group-timestamp">${timestamp}</span>
        </div>
      </div>
    </div>
  `;
}

function renderReasoningPanel(reasoning: string) {
  const text = normalizeReasoningText(reasoning);
  if (!text) {
    return nothing;
  }
  return html`
    <details class="chat-reasoning">
      <summary class="chat-reasoning__summary">
        <span class="chat-reasoning__summary-label">Reasoning</span>
      </summary>
      <div class="chat-reasoning__body">${text}</div>
    </details>
  `;
}

function collectGroupReasoning(group: MessageGroup, showReasoning: boolean): string | null {
  if (!showReasoning || normalizeRoleForGrouping(group.role) !== "assistant") {
    return null;
  }
  const blocks: string[] = [];
  for (const item of group.messages) {
    const m = item.message as Record<string, unknown>;
    const role = normalizeRoleForGrouping(typeof m.role === "string" ? m.role : "unknown");
    if (role !== "assistant") {
      continue;
    }
    const extracted = extractThinkingCached(item.message);
    const normalized = extracted ? normalizeReasoningText(extracted) : "";
    if (normalized) {
      blocks.push(normalized);
    }
  }
  return blocks.length > 0 ? blocks.join("\n\n") : null;
}

export function renderMessageGroup(
  group: MessageGroup,
  opts: {
    onOpenSidebar?: (content: string) => void;
    onOpenFilePreview?: (filePath: string) => void;
    onOpenCodingSession?: () => void;
    resolveFileUrl?: (filePath: string) => string;
    showReasoning: boolean;
    assistantName?: string;
    assistantAvatar?: string | null;
  },
) {
  const normalizedRole = normalizeRoleForGrouping(group.role);
  const assistantName = opts.assistantName ?? "Assistant";
  const who =
    normalizedRole === "user"
      ? "You"
      : normalizedRole === "assistant"
        ? assistantName
        : normalizedRole;
  const roleClass =
    normalizedRole === "user" ? "user" : normalizedRole === "assistant" ? "assistant" : "other";
  const timestamp = new Date(group.timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const groupReasoning = collectGroupReasoning(group, opts.showReasoning);

  // Auto-open: scan for completed Write/Edit tool results with file paths
  // Only opens each path once per session (until resetAutoOpenedPaths is called)
  if (opts.onOpenFilePreview) {
    for (const item of group.messages) {
      const cards = extractToolCards(item.message);
      for (const card of cards) {
        if (card.kind === "result" && isFileMutatingTool(card)) {
          const filePath = extractFilePathFromCard(card);
          if (filePath && !autoOpenedPaths.has(filePath)) {
            autoOpenedPaths.add(filePath);
            // Schedule auto-open (non-blocking, after render)
            const open = opts.onOpenFilePreview;
            queueMicrotask(() => open(filePath));
          }
        }
      }
    }
  }

  return html`
    <div class="chat-group ${roleClass}">
      ${renderAvatar(group.role, {
        name: assistantName,
        avatar: opts.assistantAvatar ?? null,
      })}
      <div class="chat-group-messages">
        ${groupReasoning ? renderReasoningPanel(groupReasoning) : nothing}
        ${renderGroupedMessages(group, opts)}
        <div class="chat-group-footer">
          <span class="chat-sender-name">${who}</span>
          <span class="chat-group-timestamp">${timestamp}</span>
        </div>
      </div>
    </div>
  `;
}

function renderAvatar(role: string, assistant?: Pick<AssistantIdentity, "name" | "avatar">) {
  const normalized = normalizeRoleForGrouping(role);
  const assistantName = assistant?.name?.trim() || "Assistant";
  const assistantAvatar = assistant?.avatar?.trim() || "";
  const initial =
    normalized === "user"
      ? "U"
      : normalized === "assistant"
        ? assistantName.charAt(0).toUpperCase() || "A"
        : normalized === "tool"
          ? "⚙"
          : "?";
  const className =
    normalized === "user"
      ? "user"
      : normalized === "assistant"
        ? "assistant"
        : normalized === "tool"
          ? "tool"
          : "other";

  if (assistantAvatar && normalized === "assistant") {
    if (isAvatarUrl(assistantAvatar)) {
      return html`<img
        class="chat-avatar ${className}"
        src="${assistantAvatar}"
        alt="${assistantName}"
        width="22"
        height="22"
      />`;
    }
    return html`<div class="chat-avatar ${className}">${assistantAvatar}</div>`;
  }

  return html`<div class="chat-avatar ${className}">${initial}</div>`;
}

function isAvatarUrl(value: string): boolean {
  return (
    /^https?:\/\//i.test(value) || /^data:image\//i.test(value) || value.startsWith("/") // Relative paths from avatar endpoint
  );
}

function renderMessageImages(images: ImageBlock[]) {
  if (images.length === 0) {
    return nothing;
  }

  const copyImageToClipboard = async (imageUrl: string, fallbackText: string) => {
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
  };

  const resolveFilename = (image: ImageBlock, index: number): string => {
    const fromPath = image.path?.replace(/\\/g, "/").split("/").pop();
    if (fromPath && fromPath.trim().length > 0) {
      return fromPath;
    }
    try {
      const parsed = new URL(image.url);
      const fromUrl = parsed.pathname.split("/").pop();
      if (fromUrl && fromUrl.trim().length > 0) {
        return fromUrl;
      }
    } catch {
      // ignore parse errors for relative/data URLs
    }
    return `image-${index + 1}.png`;
  };

  const downloadImage = (imageUrl: string, filename: string) => {
    const anchor = document.createElement("a");
    anchor.href = imageUrl;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  };

  return html`
    <div class="chat-message-images">
      ${images.map((img, index) => {
        const filename = resolveFilename(img, index);
        const copyLabel = img.path ? "Copy path" : "Copy link";
        const copyValue = img.path ?? img.url;
        return html`
          <figure class="chat-inline-image">
            <div
              class="chat-inline-image__thumb"
              tabindex="0"
              title="Image preview (double-click to expand)"
            >
              <img
                src=${img.url}
                alt=${img.alt ?? filename}
                class="chat-message-image"
                @dblclick=${() => openImageLightbox(img.url, filename)}
              />
            </div>
            <figcaption class="chat-inline-image__actions">
              <button
                type="button"
                class="chat-inline-image__action"
                @click=${(event: Event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  openImageLightbox(img.url, filename);
                }}
                title="Expand image"
              >
                ${icons.image}
                <span>Expand</span>
              </button>
              <button
                type="button"
                class="chat-inline-image__action"
                @click=${(event: Event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void copyImageToClipboard(img.url, copyValue);
                }}
                title="Copy image"
              >
                ${icons.copy}
                <span>Copy</span>
              </button>
              <button
                type="button"
                class="chat-inline-image__action"
                @click=${(event: Event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  downloadImage(img.url, filename);
                }}
                title="Download image"
              >
                ${icons.fileText}
                <span>Download</span>
              </button>
              <button
                type="button"
                class="chat-inline-image__action"
                @click=${(event: Event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void navigator.clipboard.writeText(copyValue);
                }}
                title=${copyLabel}
              >
                ${icons.link}
                <span>${copyLabel}</span>
              </button>
            </figcaption>
          </figure>
        `;
      })}
    </div>
  `;
}

/** Check if a message will render as chip-only (no bubble/markdown). */
/** A message that renders only as compact chip(s) — no text bubble. */
function isChipOnlyMessage(message: unknown): boolean {
  const m = message as Record<string, unknown>;
  const role = typeof m.role === "string" ? m.role : "unknown";

  const cards = extractToolCards(message);
  if (cards.length === 0) {
    return false;
  }

  const isToolResult =
    isToolResultMessage(message) ||
    role.toLowerCase() === "toolresult" ||
    role.toLowerCase() === "tool_result" ||
    typeof m.toolCallId === "string" ||
    typeof m.tool_call_id === "string";
  if (isToolResult) {
    if (messageHasRichToolPreview(message)) {
      return false;
    }
    return true;
  }

  // Assistant message with only tool_calls (no text content)
  if (role === "assistant") {
    const text = extractTextCached(message);
    return !text?.trim();
  }

  return false;
}

function isAssistantCallOnlyMessage(message: unknown): boolean {
  const m = message as Record<string, unknown>;
  if ((typeof m.role === "string" ? m.role : "").toLowerCase() !== "assistant") {
    return false;
  }
  const cards = extractToolCards(message);
  if (cards.length === 0 || cards.some((card) => card.kind !== "call")) {
    return false;
  }
  const text = extractTextCached(message);
  return !text?.trim();
}

/**
 * Render all messages in a group, batching consecutive chip-only messages
 * into a single flex row so they display inline.
 */
function renderGroupedMessages(
  group: MessageGroup,
  opts: {
    onOpenSidebar?: (content: string) => void;
    onOpenFilePreview?: (filePath: string) => void;
    onOpenCodingSession?: () => void;
    resolveFileUrl?: (filePath: string) => string;
    showReasoning: boolean;
  },
) {
  const results: unknown[] = [];
  let chipBatch: unknown[] = [];
  let chipCount = 0;
  let batchHasImagePreview = false;

  /** Collect file paths from Write/Edit results in the current chip batch */
  let batchFilePaths: string[] = [];

  const flushChips = () => {
    if (chipBatch.length === 0) {
      return;
    }
    const count = chipCount;
    const chips = chipBatch;
    const filePaths = [...batchFilePaths];
    results.push(
      html`<details class="chat-tool-collapse" ?open=${batchHasImagePreview}>
        <summary class="chat-tool-collapse__summary">
          ${icons.wrench}
          <span>${count} tool call${count !== 1 ? "s" : ""}</span>
        </summary>
        <div class="chat-tool-chips">${chips}</div>
      </details>`,
    );
    // Render prominent file action buttons after the tool collapse
    if (filePaths.length > 0 && opts.onOpenFilePreview) {
      const openPreview = opts.onOpenFilePreview;
      const uniquePaths = [...new Set(filePaths)];
      results.push(
        html`<div class="chat-file-actions">
          ${uniquePaths.map(
            (fp) => html`
              <button
                class="chat-file-action-btn"
                @click=${() => openPreview(fp)}
                title="Preview ${fp}"
              >
                ${icons.fileText}
                <span class="chat-file-action-btn__label">${fp.split("/").pop()}</span>
                <span class="chat-file-action-btn__action">View file</span>
              </button>
            `,
          )}
        </div>`,
      );
    }
    chipBatch = [];
    chipCount = 0;
    batchFilePaths = [];
    batchHasImagePreview = false;
  };

  for (let i = 0; i < group.messages.length; i++) {
    const item = group.messages[i];
    const nextMessage = group.messages[i + 1]?.message;
    if (
      isAssistantCallOnlyMessage(item.message) &&
      nextMessage &&
      messageHasRichToolPreview(nextMessage)
    ) {
      continue;
    }
    if (isChipOnlyMessage(item.message)) {
      const cards = extractToolCards(item.message);
      chipCount += cards.length;
      if (messageHasRichToolPreview(item.message)) {
        batchHasImagePreview = true;
      }
      // Track .md file paths from Write/Edit tool calls
      for (const card of cards) {
        if (isFileMutatingTool(card)) {
          const fp = extractFilePathFromCard(card);
          if (fp && fp.endsWith(".md")) {
            batchFilePaths.push(fp);
          }
        }
      }
      chipBatch.push(
        renderGroupedMessage(
          item.message,
          {
            isStreaming: group.isStreaming && i === group.messages.length - 1,
            // Reasoning is rendered once at the group level.
            showReasoning: false,
          },
          opts.onOpenSidebar,
          opts.onOpenFilePreview,
          opts.onOpenCodingSession,
          opts.resolveFileUrl,
        ),
      );
    } else {
      flushChips();
      results.push(
        renderGroupedMessage(
          item.message,
          {
            isStreaming: group.isStreaming && i === group.messages.length - 1,
            // Reasoning is rendered once at the group level.
            showReasoning: false,
          },
          opts.onOpenSidebar,
          opts.onOpenFilePreview,
          opts.onOpenCodingSession,
          opts.resolveFileUrl,
        ),
      );
    }
  }

  flushChips();
  return results;
}

function renderGroupedMessage(
  message: unknown,
  opts: { isStreaming: boolean; showReasoning: boolean },
  onOpenSidebar?: (content: string) => void,
  onOpenFilePreview?: (filePath: string) => void,
  onOpenCodingSession?: () => void,
  resolveFileUrl?: (filePath: string) => string,
) {
  const m = message as Record<string, unknown>;
  const role = typeof m.role === "string" ? m.role : "unknown";
  const isToolResult =
    isToolResultMessage(message) ||
    role.toLowerCase() === "toolresult" ||
    role.toLowerCase() === "tool_result" ||
    typeof m.toolCallId === "string" ||
    typeof m.tool_call_id === "string";

  const toolCards = extractToolCards(message);
  const hasToolCards = toolCards.length > 0;
  const renderedToolResults = isToolResult
    ? renderToolResultEntries(message, { resolveFileUrl })
    : [];
  const images = extractImages(message);
  const hasImages = images.length > 0;
  const interactiveBlocks = extractInteractiveBlocks(message);
  const hasInteractive = interactiveBlocks.length > 0;

  const extractedText = extractTextCached(message);
  const extractedThinking =
    opts.showReasoning && role === "assistant" ? extractThinkingCached(message) : null;

  // Extract audio files from text and strip binary content
  const audioExtraction = extractedText ? extractAudioFromText(extractedText) : null;
  const audioFiles = audioExtraction?.audioFiles ?? [];
  const hasAudio = audioFiles.length > 0;
  const textAfterAudio = hasAudio ? audioExtraction!.cleanedText : extractedText;

  const mediaExtract = textAfterAudio ? extractMediaLines(textAfterAudio) : null;
  const textMediaPaths = (mediaExtract?.mediaPaths ?? []).filter((value) => isImagePath(value));
  const textMediaImages = textMediaPaths.map((filePath) => ({
    url:
      filePath.startsWith("http://") ||
      filePath.startsWith("https://") ||
      filePath.startsWith("data:image/")
        ? filePath
        : resolveFileUrl
          ? resolveFileUrl(filePath)
          : `/api/files?path=${encodeURIComponent(filePath)}`,
    alt: filePath,
    path: filePath,
  }));

  const markdownBase = mediaExtract?.cleanedText?.trim() ? mediaExtract.cleanedText : null;
  const reasoningText = extractedThinking ? normalizeReasoningText(extractedThinking) : null;
  const markdown = markdownBase;
  const canCopyMarkdown = role === "assistant" && Boolean(markdown?.trim());

  const bubbleClasses = [
    "chat-bubble",
    canCopyMarkdown ? "has-copy" : "",
    opts.isStreaming ? "streaming" : "",
    "fade-in",
  ]
    .filter(Boolean)
    .join(" ");

  // Tool-result messages render compact chips plus a rich renderer block.
  if (hasToolCards && isToolResult) {
    const hasMediaPreview = renderedToolResults.some((entry) => entry.hasMediaPreview);
    if (hasMediaPreview) {
      return html`<div class="chat-tool-results chat-tool-results--image-only">
        ${renderedToolResults.map((entry) => entry.content)}
      </div>`;
    }
    return html`
      <div class="chat-tool-result">
        <div class="chat-tool-chips">
          ${toolCards.map((card) =>
            renderToolCardSidebar(card, onOpenSidebar, onOpenFilePreview, onOpenCodingSession),
          )}
        </div>
        <div class="chat-tool-results">
          ${renderedToolResults.map((entry) => entry.content)}
        </div>
      </div>
    `;
  }

  // Assistant messages with text: suppress tool_call chips (result chips follow).
  // Assistant messages with ONLY tool_calls (no text): render as chips.
  const isAssistantCallOnly = role === "assistant" && hasToolCards && !markdown;
  if (isAssistantCallOnly) {
    return html`${toolCards.map((card) =>
      renderToolCardSidebar(card, onOpenSidebar, onOpenFilePreview, onOpenCodingSession),
    )}`;
  }
  const showInlineChips = hasToolCards && role !== "assistant";

  if (
    !markdown &&
    !reasoningText &&
    !showInlineChips &&
    !hasImages &&
    textMediaImages.length === 0 &&
    !hasAudio &&
    !hasInteractive
  ) {
    return nothing;
  }

  return html`
      <div class="${bubbleClasses}">
        ${canCopyMarkdown ? renderCopyAsMarkdownButton(markdown) : nothing}
      ${renderMessageImages([...images, ...textMediaImages])}
      ${renderAudioPlayers(audioFiles)}
      ${reasoningText ? renderReasoningPanel(reasoningText) : nothing}
      ${
        markdown
          ? html`<div class="chat-text">${unsafeHTML(toSanitizedMarkdownHtml(markdown))}</div>`
          : nothing
      }
      ${
        showInlineChips
          ? html`<div class="chat-tool-chips">${toolCards.map((card) =>
              renderToolCardSidebar(card, onOpenSidebar, onOpenFilePreview, onOpenCodingSession),
            )}</div>`
          : nothing
      }
      ${hasInteractive ? interactiveBlocks.map((block) => renderInteractiveBlock(block)) : nothing}
    </div>
  `;
}
