import { html, nothing } from "lit";
import { ref } from "lit/directives/ref.js";
import { repeat } from "lit/directives/repeat.js";
import type { GatewaySessionRow, SessionsListResult } from "../types";
import type { ChatItem, MessageGroup } from "../types/chat-types";
import type { ChatAttachment, ChatQueueItem } from "../ui-types";
import {
  renderMessageGroup,
  renderReadingIndicatorGroup,
  renderStreamingGroup,
} from "../chat/grouped-render";
import {
  isToolResultMessage,
  normalizeMessage,
  normalizeRoleForGrouping,
} from "../chat/message-normalizer";
import { extractToolCards } from "../chat/tool-cards";
import { icons } from "../icons";
import { renderMarkdownSidebar } from "./markdown-sidebar";
import { humanizeSessionKey } from "./thread-list";
import "../components/resizable-divider";

export type CompactionIndicatorStatus = {
  active: boolean;
  startedAt: number | null;
  completedAt: number | null;
};

export type ChatProps = {
  sessionKey: string;
  onSessionKeyChange: (next: string) => void;
  thinkingLevel: string | null;
  showThinking: boolean;
  loading: boolean;
  sending: boolean;
  canAbort?: boolean;
  compactionStatus?: CompactionIndicatorStatus | null;
  messages: unknown[];
  toolMessages: unknown[];
  stream: string | null;
  streamStartedAt: number | null;
  assistantAvatarUrl?: string | null;
  draft: string;
  queue: ChatQueueItem[];
  connected: boolean;
  canSend: boolean;
  disabledReason: string | null;
  error: string | null;
  sessions: SessionsListResult | null;
  // Focus mode
  focusMode: boolean;
  // Sidebar state (legacy — single-pane only)
  sidebarOpen?: boolean;
  sidebarContent?: string | null;
  sidebarError?: string | null;
  splitRatio?: number;
  assistantName: string;
  assistantAvatar: string | null;
  // Image attachments
  attachments?: ChatAttachment[];
  onAttachmentsChange?: (attachments: ChatAttachment[]) => void;
  /** Session keys currently visible in other panes (split mode only). */
  openSessionKeys?: Set<string>;
  // Event handlers
  onRefresh: () => void;
  onToggleFocusMode: () => void;
  onDraftChange: (next: string) => void;
  onSend: () => void;
  onAbort?: () => void;
  onQueueRemove: (id: string) => void;
  onQueueSendNow: (id: string) => void;
  onQueueClearAll: () => void;
  onSendImmediately: () => void;
  onNewSession: () => void;
  onOpenSidebar?: (content: string) => void;
  onCloseSidebar?: () => void;
  onSplitRatioChange?: (ratio: number) => void;
  onChatScroll?: (event: Event) => void;
  // File preview callback (opens global artifact panel)
  onOpenFilePreview?: (filePath: string) => void;
};

const COMPACTION_TOAST_DURATION_MS = 5000;

function adjustTextareaHeight(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function renderCompactionIndicator(status: CompactionIndicatorStatus | null | undefined) {
  if (!status) {
    return nothing;
  }

  // Show "compacting..." while active
  if (status.active) {
    return html`
      <div class="compaction-toast compaction-toast--active">
        ${icons.loader} Compacting context…
      </div>
    `;
  }

  // Show "compaction complete" briefly after completion
  if (status.completedAt) {
    const elapsed = Date.now() - status.completedAt;
    if (elapsed < COMPACTION_TOAST_DURATION_MS) {
      return html`
        <div class="compaction-toast compaction-toast--complete">
          ${icons.check} Compacted
        </div>
      `;
    }
  }

  return nothing;
}

function generateAttachmentId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const MAX_IMAGE_DIMENSION = 1568;
const JPEG_QUALITY = 0.8;
const MAX_DATA_URL_BYTES = 4 * 1024 * 1024; // 4 MB target

function canvasHasAlpha(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) {
      return true;
    }
  }
  return false;
}

async function compressImage(
  dataUrl: string,
  mimeType: string,
): Promise<{ dataUrl: string; mimeType: string }> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.addEventListener("load", () => resolve());
    img.addEventListener("error", reject);
    img.src = dataUrl;
  });

  const { width, height } = img;
  const needsResize = width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION;
  const needsCompress = dataUrl.length > MAX_DATA_URL_BYTES;

  if (!needsResize && !needsCompress) {
    return { dataUrl, mimeType };
  }

  let targetW = width;
  let targetH = height;
  if (needsResize) {
    const scale = MAX_IMAGE_DIMENSION / Math.max(width, height);
    targetW = Math.round(width * scale);
    targetH = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, targetW, targetH);

  // Only keep PNG if the image actually uses transparency; screenshots are
  // PNG but fully opaque — JPEG compresses them far better.
  const hasAlpha = mimeType === "image/png" && canvasHasAlpha(ctx, targetW, targetH);

  if (hasAlpha) {
    const result = canvas.toDataURL("image/png");
    if (result.length <= MAX_DATA_URL_BYTES) {
      return { dataUrl: result, mimeType: "image/png" };
    }
    // PNG still too large — fall through to JPEG (alpha will be flattened)
  }

  // JPEG with decreasing quality until under budget
  let quality = JPEG_QUALITY;
  while (quality >= 0.3) {
    const result = canvas.toDataURL("image/jpeg", quality);
    if (result.length <= MAX_DATA_URL_BYTES) {
      return { dataUrl: result, mimeType: "image/jpeg" };
    }
    quality -= 0.1;
  }

  // Last resort: lowest quality JPEG
  const fallback = canvas.toDataURL("image/jpeg", 0.2);
  return { dataUrl: fallback, mimeType: "image/jpeg" };
}

function handlePaste(e: ClipboardEvent, props: ChatProps) {
  const items = e.clipboardData?.items;
  if (!items || !props.onAttachmentsChange) {
    return;
  }

  const imageItems: DataTransferItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.startsWith("image/")) {
      imageItems.push(item);
    }
  }

  if (imageItems.length === 0) {
    return;
  }

  e.preventDefault();

  for (const item of imageItems) {
    const file = item.getAsFile();
    if (!file) {
      continue;
    }

    const reader = new FileReader();
    reader.addEventListener("load", async () => {
      const rawDataUrl = reader.result as string;
      const { dataUrl, mimeType } = await compressImage(rawDataUrl, file.type);
      const newAttachment: ChatAttachment = {
        id: generateAttachmentId(),
        dataUrl,
        mimeType,
      };
      const current = props.attachments ?? [];
      props.onAttachmentsChange?.([...current, newAttachment]);
    });
    reader.readAsDataURL(file);
  }
}

function renderAttachmentPreview(props: ChatProps) {
  const attachments = props.attachments ?? [];
  if (attachments.length === 0) {
    return nothing;
  }

  return html`
    <div class="chat-attachments">
      ${attachments.map(
        (att) => html`
          <div class="chat-attachment">
            <img
              src=${att.dataUrl}
              alt="Attachment preview"
              class="chat-attachment__img"
            />
            <button
              class="chat-attachment__remove"
              type="button"
              aria-label="Remove attachment"
              title="Remove attachment"
              @click=${() => {
                const next = (props.attachments ?? []).filter((a) => a.id !== att.id);
                props.onAttachmentsChange?.(next);
              }}
            >
              ${icons.x}
            </button>
          </div>
        `,
      )}
    </div>
  `;
}

/** Friendly relative time for queue items (e.g. "just now", "2m ago") */
function relativeQueueTime(createdAt: number): string {
  const diff = Date.now() - createdAt;
  if (diff < 0 || diff < 10_000) {
    return "just now";
  }
  const sec = Math.round(diff / 1000);
  if (sec < 60) {
    return `${sec}s ago`;
  }
  const min = Math.round(sec / 60);
  if (min < 60) {
    return `${min}m ago`;
  }
  const hr = Math.round(min / 60);
  return `${hr}h ago`;
}

/** Compact relative time (e.g. "3m", "2h", "5d") */
function compactAgo(ms?: number | null): string {
  if (!ms) {
    return "";
  }
  const diff = Date.now() - ms;
  if (diff < 0) {
    return "now";
  }
  const sec = Math.round(diff / 1000);
  if (sec < 60) {
    return `${sec}s`;
  }
  const min = Math.round(sec / 60);
  if (min < 60) {
    return `${min}m`;
  }
  const hr = Math.round(min / 60);
  if (hr < 24) {
    return `${hr}h`;
  }
  const day = Math.round(hr / 24);
  if (day < 30) {
    return `${day}d`;
  }
  const mo = Math.round(day / 30);
  return `${mo}mo`;
}

/**
 * Session picker shown inside an empty split pane.
 * Lists recent sessions not already open in another pane.
 */
function renderSessionPicker(
  sessions: GatewaySessionRow[],
  openKeys: Set<string>,
  currentKey: string,
  onSelect: (key: string) => void,
) {
  // Filter: exclude sessions already visible in a pane, archived, and cron/global
  const candidates = sessions.filter((s) => {
    if (s.key === currentKey) {
      return false;
    }
    if (openKeys.has(s.key)) {
      return false;
    }
    if (s.archivedAt) {
      return false;
    }
    if (s.kind === "global") {
      return false;
    }
    const k = s.key.toLowerCase();
    if (k.includes(":cron:") || k.includes(":cron-")) {
      return false;
    }
    return true;
  });

  // Sort by most recently updated
  candidates.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

  // Cap at a reasonable number
  const visible = candidates.slice(0, 12);

  if (visible.length === 0) {
    return html`
      <div class="session-picker">
        <div class="session-picker__header">No other sessions available</div>
        <div class="session-picker__hint">Start a new conversation below</div>
      </div>
    `;
  }

  return html`
    <div class="session-picker">
      <div class="session-picker__header">Open a recent session</div>
      <div class="session-picker__list">
        ${visible.map(
          (s) => html`
            <button
              class="session-picker__item"
              @click=${() => onSelect(s.key)}
              title=${s.key}
            >
              <span class="session-picker__item-label">
                ${s.displayName || s.label || humanizeSessionKey(s.key)}
              </span>
              ${
                s.derivedTitle
                  ? html`<span class="session-picker__item-title">${s.derivedTitle}</span>`
                  : nothing
              }
              ${
                s.updatedAt
                  ? html`<span class="session-picker__item-time">${compactAgo(s.updatedAt)}</span>`
                  : nothing
              }
            </button>
          `,
        )}
      </div>
      <div class="session-picker__hint">Or start a new conversation below</div>
    </div>
  `;
}

export function renderChat(props: ChatProps) {
  const canCompose = props.connected;
  const isBusy = props.sending || props.stream !== null;
  const canAbort = Boolean(props.canAbort && props.onAbort);
  const activeSession = props.sessions?.sessions?.find((row) => row.key === props.sessionKey);
  const reasoningLevel = activeSession?.reasoningLevel ?? "off";
  const showReasoning = props.showThinking && reasoningLevel !== "off";
  const assistantIdentity = {
    name: props.assistantName,
    avatar: props.assistantAvatar ?? props.assistantAvatarUrl ?? null,
  };

  const hasAttachments = (props.attachments?.length ?? 0) > 0;
  const composePlaceholder = hasAttachments
    ? "Add a message or paste more images..."
    : props.connected
      ? "Message (↩ to send, Shift+↩ for line breaks, paste images)"
      : "Message (connecting…)";

  const sidebarOpen = Boolean(props.sidebarOpen && props.onCloseSidebar);
  const splitRatio = props.splitRatio ?? 0.6;
  const handleThreadScroll = (e: Event) => {
    props.onChatScroll?.(e);
    const container = e.currentTarget as HTMLElement;
    const dist = container.scrollHeight - container.scrollTop - container.clientHeight;
    const main = container.closest(".chat-main");
    if (main) {
      main.classList.toggle("chat-main--scrolled-up", dist >= 200);
    }
  };

  const handleScrollToBottom = (e: Event) => {
    const btn = e.currentTarget as HTMLElement;
    const thread = btn.closest(".chat-main")?.querySelector(".chat-thread");
    if (thread) {
      thread.scrollTo({ top: thread.scrollHeight, behavior: "smooth" });
    }
  };

  // Show session picker when pane is empty and in split mode
  const isEmpty = !props.loading && props.messages.length === 0 && props.stream === null;
  const showPicker = isEmpty && props.openSessionKeys && props.sessions?.sessions;

  const thread = html`
    <div
      class="chat-thread"
      role="log"
      aria-live="polite"
      @scroll=${handleThreadScroll}
    >
      ${
        showPicker
          ? renderSessionPicker(
              props.sessions!.sessions,
              props.openSessionKeys!,
              props.sessionKey,
              props.onSessionKeyChange,
            )
          : nothing
      }
      ${
        props.loading
          ? html`
              <div class="muted">Loading chat…</div>
            `
          : nothing
      }
      ${repeat(
        buildChatItems(props),
        (item) => item.key,
        (item) => {
          if (item.kind === "load-more") {
            return html`<div class="chat-load-more">
            <button
              class="chat-load-more__btn"
              type="button"
              @click=${(e: Event) => {
                const btn = e.currentTarget as HTMLElement;
                const thread = btn.closest(".chat-thread");
                const prevHeight = thread?.scrollHeight ?? 0;
                item.onLoadMore();
                // Re-render by dispatching a custom event the app-render can pick up
                btn.dispatchEvent(
                  new CustomEvent("chat-load-more", { bubbles: true, composed: true }),
                );
                // Preserve scroll position after new messages are prepended
                requestAnimationFrame(() => {
                  if (thread) {
                    const newHeight = thread.scrollHeight;
                    thread.scrollTop += newHeight - prevHeight;
                  }
                });
              }}
            >Load ${Math.min(LOAD_MORE_BATCH, item.remaining)} older messages${item.remaining > LOAD_MORE_BATCH ? ` (${item.remaining} remaining)` : ""}</button>
          </div>`;
          }

          if (item.kind === "reading-indicator") {
            return renderReadingIndicatorGroup(assistantIdentity);
          }

          if (item.kind === "stream") {
            return renderStreamingGroup(
              item.text,
              item.startedAt,
              props.onOpenSidebar,
              assistantIdentity,
              props.onOpenFilePreview,
            );
          }

          if (item.kind === "group") {
            return renderMessageGroup(item, {
              onOpenSidebar: props.onOpenSidebar,
              onOpenFilePreview: props.onOpenFilePreview,
              showReasoning,
              assistantName: props.assistantName,
              assistantAvatar: assistantIdentity.avatar,
            });
          }

          return nothing;
        },
      )}
    </div>
    <button
      class="chat-scroll-bottom"
      type="button"
      aria-label="Scroll to bottom"
      title="Scroll to bottom"
      @click=${handleScrollToBottom}
    >
      ${icons.arrowDown}
    </button>
  `;

  return html`
    <section class="card chat">
      ${props.disabledReason ? html`<div class="callout">${props.disabledReason}</div>` : nothing}

      ${props.error ? html`<div class="callout danger">${props.error}</div>` : nothing}

      ${renderCompactionIndicator(props.compactionStatus)}

      ${
        props.focusMode
          ? html`
            <button
              class="chat-focus-exit"
              type="button"
              @click=${props.onToggleFocusMode}
              aria-label="Exit focus mode"
              title="Exit focus mode"
            >
              ${icons.x}
            </button>
          `
          : nothing
      }

      <div
        class="chat-split-container ${sidebarOpen ? "chat-split-container--open" : ""}"
      >
        <div
          class="chat-main"
          style="flex: ${sidebarOpen ? `0 0 ${splitRatio * 100}%` : "1 1 100%"}"
        >
          ${thread}
        </div>

        ${
          sidebarOpen
            ? html`
              <resizable-divider
                .splitRatio=${splitRatio}
                @resize=${(e: CustomEvent) => props.onSplitRatioChange?.(e.detail.splitRatio)}
              ></resizable-divider>
              <div class="chat-sidebar">
                ${renderMarkdownSidebar({
                  content: props.sidebarContent ?? null,
                  error: props.sidebarError ?? null,
                  onClose: props.onCloseSidebar!,
                  onViewRawText: () => {
                    if (!props.sidebarContent || !props.onOpenSidebar) {
                      return;
                    }
                    props.onOpenSidebar(`\`\`\`\n${props.sidebarContent}\n\`\`\``);
                  },
                })}
              </div>
            `
            : nothing
        }
      </div>

      ${
        props.queue.length
          ? html`
            <div class="chat-queue" role="status" aria-live="polite">
              <div class="chat-queue__header">
                <span class="chat-queue__count">
                  ${icons.listPlus} Queued · ${props.queue.length}
                </span>
                <button
                  class="chat-queue__clear-all"
                  type="button"
                  title="Clear all queued messages"
                  @click=${() => props.onQueueClearAll()}
                >Clear</button>
              </div>
              <div class="chat-queue__list">
                ${props.queue.map(
                  (item) => html`
                    <div class="chat-queue__item">
                      <div class="chat-queue__item-body">
                        <div class="chat-queue__text">
                          ${
                            item.text ||
                            (item.attachments?.length ? `Image (${item.attachments.length})` : "")
                          }
                        </div>
                        <div class="chat-queue__meta">
                          ${
                            item.attachments?.length
                              ? html`<span class="chat-queue__attachment-indicator" title="${item.attachments.length} attachment${item.attachments.length > 1 ? "s" : ""}">${icons.paperclip}</span>`
                              : nothing
                          }
                          <span class="chat-queue__time">${relativeQueueTime(item.createdAt)}</span>
                        </div>
                      </div>
                      <div class="chat-queue__actions">
                        <button
                          class="chat-queue__send-now"
                          type="button"
                          aria-label="Send this message now"
                          title="Stop current run and send now"
                          @click=${() => props.onQueueSendNow(item.id)}
                        >
                          ${icons.arrowUp}
                        </button>
                        <button
                          class="chat-queue__remove"
                          type="button"
                          aria-label="Remove queued message"
                          title="Remove from queue"
                          @click=${() => props.onQueueRemove(item.id)}
                        >
                          ${icons.x}
                        </button>
                      </div>
                    </div>
                  `,
                )}
              </div>
            </div>
          `
          : nothing
      }

      <div class="chat-compose">
        ${renderAttachmentPreview(props)}
        <div class="chat-compose__row">
          <label class="field chat-compose__field">
            <span>Message</span>
            <textarea
              ${ref((el) => el && adjustTextareaHeight(el as HTMLTextAreaElement))}
              .value=${props.draft}
              rows="1"
              @keydown=${(e: KeyboardEvent) => {
                if (e.key !== "Enter") {
                  return;
                }
                if (e.isComposing || e.keyCode === 229) {
                  return;
                }
                // Cmd+Shift+Enter (Mac) or Ctrl+Shift+Enter = send immediately when busy
                if (e.shiftKey && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  if (props.connected && isBusy) {
                    props.onSendImmediately();
                  }
                  return;
                }
                if (e.shiftKey) {
                  return;
                } // Allow Shift+Enter for line breaks
                if (!props.connected) {
                  return;
                }
                e.preventDefault();
                if (canCompose) {
                  props.onSend();
                }
              }}
              @input=${(e: Event) => {
                const target = e.target as HTMLTextAreaElement;
                adjustTextareaHeight(target);
                props.onDraftChange(target.value);
              }}
              @paste=${(e: ClipboardEvent) => handlePaste(e, props)}
              placeholder=${composePlaceholder}
            ></textarea>
          </label>
          <div class="chat-compose__actions">
            ${
              canAbort
                ? html`<button
                  class="btn chat-compose__icon-btn chat-compose__icon-btn--stop"
                  title="Stop"
                  @click=${props.onAbort}
                >${icons.square}</button>`
                : nothing
            }
            <button
              class="btn primary chat-compose__icon-btn"
              ?disabled=${!props.connected}
              title="${isBusy ? "Queue" : "Send"}"
              @click=${props.onSend}
            >${isBusy ? icons.listPlus : icons.arrowUp}</button>
            ${
              isBusy
                ? html`<button
                  class="btn chat-compose__icon-btn chat-compose__icon-btn--send-now"
                  ?disabled=${!props.connected}
                  title="Stop current run and send now (⇧⌘↩)"
                  @click=${props.onSendImmediately}
                >${icons.arrowUp}</button>`
                : nothing
            }
          </div>
        </div>
      </div>
    </section>
  `;
}

const CHAT_HISTORY_RENDER_LIMIT = 50;
const LOAD_MORE_BATCH = 50;

/** Per-session state tracking how many messages to render. */
const sessionRenderLimits = new Map<string, number>();

function getSessionRenderLimit(sessionKey: string): number {
  return sessionRenderLimits.get(sessionKey) ?? CHAT_HISTORY_RENDER_LIMIT;
}

function expandSessionRenderLimit(sessionKey: string, total: number): void {
  const current = getSessionRenderLimit(sessionKey);
  sessionRenderLimits.set(sessionKey, Math.min(current + LOAD_MORE_BATCH, total));
}

function groupMessages(items: ChatItem[]): Array<ChatItem | MessageGroup> {
  const result: Array<ChatItem | MessageGroup> = [];
  let currentGroup: MessageGroup | null = null;

  for (const item of items) {
    if (item.kind !== "message") {
      if (currentGroup) {
        result.push(currentGroup);
        currentGroup = null;
      }
      result.push(item);
      continue;
    }

    const normalized = normalizeMessage(item.message);
    const role = normalizeRoleForGrouping(normalized.role);
    const timestamp = normalized.timestamp || Date.now();

    // Fold chip-only tool results into the preceding assistant group
    // so consecutive tool calls render inline instead of as separate groups.
    const isChipOnly =
      role === "tool" && currentGroup?.role === "assistant" && isChipOnlyMessage(item.message);

    if (isChipOnly) {
      currentGroup!.messages.push({ message: item.message, key: item.key });
    } else if (!currentGroup || currentGroup.role !== role) {
      if (currentGroup) {
        result.push(currentGroup);
      }
      currentGroup = {
        kind: "group",
        key: `group:${role}:${item.key}`,
        role,
        messages: [{ message: item.message, key: item.key }],
        timestamp,
        isStreaming: false,
      };
    } else {
      currentGroup.messages.push({ message: item.message, key: item.key });
    }
  }

  if (currentGroup) {
    result.push(currentGroup);
  }
  return result;
}

/** Hide internal system plumbing (e.g. GatewayRestart) from chat UI. */
function isInternalSystemMessage(message: unknown): boolean {
  const m = message as Record<string, unknown>;
  const content = m.content;
  let text: string | null = null;
  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (
        typeof block === "object" &&
        block !== null &&
        (block as Record<string, unknown>).type === "text"
      ) {
        text = (block as Record<string, unknown>).text as string;
        break;
      }
    }
  } else if (typeof m.text === "string") {
    text = m.text;
  }
  if (!text) {
    return false;
  }
  return /^(System:\s*\[.*?\]\s*)?GatewayRestart[\s:]/.test(text.trimStart());
}

function buildChatItems(props: ChatProps): Array<ChatItem | MessageGroup> {
  const items: ChatItem[] = [];
  const history = Array.isArray(props.messages) ? props.messages : [];
  const tools = Array.isArray(props.toolMessages) ? props.toolMessages : [];
  const limit = getSessionRenderLimit(props.sessionKey);
  const historyStart = Math.max(0, history.length - limit);
  if (historyStart > 0) {
    items.push({
      kind: "load-more",
      key: "chat:history:load-more",
      remaining: historyStart,
      onLoadMore: () => {
        expandSessionRenderLimit(props.sessionKey, history.length);
      },
    });
  }
  for (let i = historyStart; i < history.length; i++) {
    const msg = history[i];
    if (isInternalSystemMessage(msg)) {
      continue;
    }
    items.push({
      kind: "message",
      key: messageKey(msg, i),
      message: msg,
    });
  }
  // Always show tool activity chips during an active run (stream non-null).
  // When not streaming, only show if showThinking is enabled.
  const showTools = props.showThinking || (props.stream !== null && tools.length > 0);
  if (showTools) {
    for (let i = 0; i < tools.length; i++) {
      items.push({
        kind: "message",
        key: messageKey(tools[i], i + history.length),
        message: tools[i],
      });
    }
  }

  if (props.stream !== null) {
    const key = `stream:${props.sessionKey}:${props.streamStartedAt ?? "live"}`;
    if (props.stream.trim().length > 0) {
      items.push({
        kind: "stream",
        key,
        text: props.stream,
        startedAt: props.streamStartedAt ?? Date.now(),
      });
    } else {
      items.push({ kind: "reading-indicator", key });
    }
  }

  return groupMessages(items);
}

/** A tool-result message that should render as compact chips. */
function isChipOnlyMessage(message: unknown): boolean {
  if (!isToolResultMessage(message)) {
    const m = message as Record<string, unknown>;
    const role = typeof m.role === "string" ? m.role.toLowerCase() : "";
    if (role !== "toolresult" && role !== "tool_result") {
      return false;
    }
  }
  const cards = extractToolCards(message);
  return cards.length > 0;
}

function messageKey(message: unknown, index: number): string {
  const m = message as Record<string, unknown>;
  const toolCallId = typeof m.toolCallId === "string" ? m.toolCallId : "";
  if (toolCallId) {
    return `tool:${toolCallId}`;
  }
  const id = typeof m.id === "string" ? m.id : "";
  if (id) {
    return `msg:${id}`;
  }
  const messageId = typeof m.messageId === "string" ? m.messageId : "";
  if (messageId) {
    return `msg:${messageId}`;
  }
  const timestamp = typeof m.timestamp === "number" ? m.timestamp : null;
  const role = typeof m.role === "string" ? m.role : "unknown";
  if (timestamp != null) {
    return `msg:${role}:${timestamp}:${index}`;
  }
  return `msg:${role}:${index}`;
}
