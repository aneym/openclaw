import { html, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import type { AssistantIdentity } from "../assistant-identity";
import type { MessageGroup } from "../types/chat-types";
import { icons } from "../icons";
import { toSanitizedMarkdownHtml } from "../markdown";
import { renderCopyAsMarkdownButton } from "./copy-as-markdown";
import {
  extractTextCached,
  extractThinkingCached,
  formatReasoningMarkdown,
} from "./message-extract";
import { isToolResultMessage, normalizeRoleForGrouping } from "./message-normalizer";
import {
  extractToolCards,
  renderToolCardSidebar,
  extractFilePathFromCard,
  isFileMutatingTool,
} from "./tool-cards";

/** Track which file paths have already been auto-opened to avoid re-render loops. */
const autoOpenedPaths = new Set<string>();

/** Clear auto-opened tracking (call on new user message to allow re-opens). */
export function resetAutoOpenedPaths() {
  autoOpenedPaths.clear();
}

type ImageBlock = {
  url: string;
  alt?: string;
};

function extractImages(message: unknown): ImageBlock[] {
  const m = message as Record<string, unknown>;
  const content = m.content;
  const images: ImageBlock[] = [];

  if (Array.isArray(content)) {
    for (const block of content) {
      if (typeof block !== "object" || block === null) continue;
      const b = block as Record<string, unknown>;

      if (b.type === "image") {
        // Handle source object format (from sendChatMessage)
        const source = b.source as Record<string, unknown> | undefined;
        if (source?.type === "base64" && typeof source.data === "string") {
          const data = source.data as string;
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
  startedAt: number,
  onOpenSidebar?: (content: string) => void,
  assistant?: AssistantIdentity,
  onOpenFilePreview?: (filePath: string) => void,
) {
  const timestamp = new Date(startedAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const name = assistant?.name ?? "Assistant";

  return html`
    <div class="chat-group assistant">
      ${renderAvatar("assistant", assistant)}
      <div class="chat-group-messages">
        ${renderGroupedMessage(
          {
            role: "assistant",
            content: [{ type: "text", text }],
            timestamp: startedAt,
          },
          { isStreaming: true, showReasoning: false },
          onOpenSidebar,
          onOpenFilePreview,
        )}
        <div class="chat-group-footer">
          <span class="chat-sender-name">${name}</span>
          <span class="chat-group-timestamp">${timestamp}</span>
        </div>
      </div>
    </div>
  `;
}

export function renderMessageGroup(
  group: MessageGroup,
  opts: {
    onOpenSidebar?: (content: string) => void;
    onOpenFilePreview?: (filePath: string) => void;
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
      />`;
    }
    return html`<div class="chat-avatar ${className}">${assistantAvatar}</div>`;
  }

  return html`<div class="chat-avatar ${className}">${initial}</div>`;
}

function isAvatarUrl(value: string): boolean {
  return (
    /^https?:\/\//i.test(value) || /^data:image\//i.test(value) || /^\//.test(value) // Relative paths from avatar endpoint
  );
}

function renderMessageImages(images: ImageBlock[]) {
  if (images.length === 0) return nothing;

  return html`
    <div class="chat-message-images">
      ${images.map(
        (img) => html`
          <img
            src=${img.url}
            alt=${img.alt ?? "Attached image"}
            class="chat-message-image"
            @click=${() => window.open(img.url, "_blank")}
          />
        `,
      )}
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
    return true;
  }

  // Assistant message with only tool_calls (no text content)
  if (role === "assistant") {
    const text = extractTextCached(message);
    return !text?.trim();
  }

  return false;
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
    showReasoning: boolean;
  },
) {
  const results: unknown[] = [];
  let chipBatch: unknown[] = [];
  let chipCount = 0;

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
      html`<details class="chat-tool-collapse">
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
  };

  for (let i = 0; i < group.messages.length; i++) {
    const item = group.messages[i];
    if (isChipOnlyMessage(item.message)) {
      const cards = extractToolCards(item.message);
      chipCount += cards.length;
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
            showReasoning: opts.showReasoning,
          },
          opts.onOpenSidebar,
          opts.onOpenFilePreview,
        ),
      );
    } else {
      flushChips();
      results.push(
        renderGroupedMessage(
          item.message,
          {
            isStreaming: group.isStreaming && i === group.messages.length - 1,
            showReasoning: opts.showReasoning,
          },
          opts.onOpenSidebar,
          opts.onOpenFilePreview,
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
  const images = extractImages(message);
  const hasImages = images.length > 0;

  const extractedText = extractTextCached(message);
  const extractedThinking =
    opts.showReasoning && role === "assistant" ? extractThinkingCached(message) : null;

  // Extract audio files from text and strip binary content
  const audioExtraction = extractedText ? extractAudioFromText(extractedText) : null;
  const audioFiles = audioExtraction?.audioFiles ?? [];
  const hasAudio = audioFiles.length > 0;
  const textAfterAudio = hasAudio ? audioExtraction!.cleanedText : extractedText;

  const markdownBase = textAfterAudio?.trim() ? textAfterAudio : null;
  const reasoningMarkdown = extractedThinking ? formatReasoningMarkdown(extractedThinking) : null;
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

  // Tool-result messages always render as compact chips (text via sidebar)
  if (hasToolCards && isToolResult) {
    return html`${toolCards.map((card) =>
      renderToolCardSidebar(card, onOpenSidebar, onOpenFilePreview),
    )}`;
  }

  // Assistant messages with text: suppress tool_call chips (result chips follow).
  // Assistant messages with ONLY tool_calls (no text): render as chips.
  const isAssistantCallOnly = role === "assistant" && hasToolCards && !markdown;
  if (isAssistantCallOnly) {
    return html`${toolCards.map((card) =>
      renderToolCardSidebar(card, onOpenSidebar, onOpenFilePreview),
    )}`;
  }
  const showInlineChips = hasToolCards && role !== "assistant";

  if (!markdown && !showInlineChips && !hasImages && !hasAudio) return nothing;

  return html`
    <div class="${bubbleClasses}">
      ${canCopyMarkdown ? renderCopyAsMarkdownButton(markdown!) : nothing}
      ${renderMessageImages(images)}
      ${renderAudioPlayers(audioFiles)}
      ${
        reasoningMarkdown
          ? html`<div class="chat-thinking">${unsafeHTML(
              toSanitizedMarkdownHtml(reasoningMarkdown),
            )}</div>`
          : nothing
      }
      ${
        markdown
          ? html`<div class="chat-text">${unsafeHTML(toSanitizedMarkdownHtml(markdown))}</div>`
          : nothing
      }
      ${
        showInlineChips
          ? html`<div class="chat-tool-chips">${toolCards.map((card) =>
              renderToolCardSidebar(card, onOpenSidebar, onOpenFilePreview),
            )}</div>`
          : nothing
      }
    </div>
  `;
}
