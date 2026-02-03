import { html, nothing } from "lit";
import type { ToolCard } from "../types/chat-types";
import { icons } from "../icons";
import { formatToolDetail, resolveToolDisplay } from "../tool-display";
import { extractTextCached } from "./message-extract";
import { isToolResultMessage } from "./message-normalizer";
import { formatToolOutputForSidebar } from "./tool-helpers";

/** Tool names that operate on files (used for file preview). */
const FILE_TOOL_NAMES = new Set(["read", "write", "edit"]);

/** Pattern to detect coding agent commands in exec tool calls. */
const CODING_AGENT_RE = /^(claude|codex|cc|kimi)\b/;

/** Tool names for exec-style tool calls. */
const EXEC_TOOL_NAMES = new Set(["exec", "bash", "process"]);

export function extractToolCards(message: unknown): ToolCard[] {
  const m = message as Record<string, unknown>;
  const content = normalizeContent(m.content);
  const cards: ToolCard[] = [];

  for (const item of content) {
    const kind = (typeof item.type === "string" ? item.type : "").toLowerCase();
    const isToolCall =
      ["toolcall", "tool_call", "tooluse", "tool_use"].includes(kind) ||
      (typeof item.name === "string" && item.arguments != null);
    if (isToolCall) {
      cards.push({
        kind: "call",
        name: (item.name as string) ?? "tool",
        args: coerceArgs(item.arguments ?? item.args),
      });
    }
  }

  for (const item of content) {
    const kind = (typeof item.type === "string" ? item.type : "").toLowerCase();
    if (kind !== "toolresult" && kind !== "tool_result") {
      continue;
    }
    const text = extractToolText(item);
    const name = typeof item.name === "string" ? item.name : "tool";
    cards.push({ kind: "result", name, text });
  }

  if (isToolResultMessage(message) && !cards.some((card) => card.kind === "result")) {
    const name =
      (typeof m.toolName === "string" && m.toolName) ||
      (typeof m.tool_name === "string" && m.tool_name) ||
      "tool";
    const text = extractTextCached(message) ?? undefined;
    cards.push({ kind: "result", name, text });
  }

  return cards;
}

/**
 * Extract the file path from a tool card's args, if present.
 */
export function extractFilePathFromCard(card: ToolCard): string | undefined {
  if (!card.args || typeof card.args !== "object") {
    return undefined;
  }
  const args = card.args as Record<string, unknown>;
  const filePath =
    (typeof args.file_path === "string" && args.file_path) ||
    (typeof args.path === "string" && args.path) ||
    undefined;
  return filePath || undefined;
}

/**
 * Check if a tool card represents a file-mutating tool (write/edit).
 */
export function isFileMutatingTool(card: ToolCard): boolean {
  const name = card.name.toLowerCase();
  return name === "write" || name === "edit";
}

/**
 * Extract the command string from an exec/bash tool card.
 */
export function extractCommandFromCard(card: ToolCard): string | undefined {
  if (!card.args || typeof card.args !== "object") return undefined;
  const args = card.args as Record<string, unknown>;
  const cmd = typeof args.command === "string" ? args.command.trim() : undefined;
  return cmd || undefined;
}

/**
 * Check if a tool card is an exec call that runs a coding agent (claude/codex/cc/kimi).
 */
export function isCodingSessionTool(card: ToolCard): boolean {
  const name = card.name.toLowerCase();
  if (!EXEC_TOOL_NAMES.has(name)) return false;
  const cmd = extractCommandFromCard(card);
  return cmd ? CODING_AGENT_RE.test(cmd) : false;
}

export function renderToolCardSidebar(
  card: ToolCard,
  onOpenSidebar?: (content: string) => void,
  onOpenFilePreview?: (filePath: string) => void,
  onOpenCodingSession?: () => void,
) {
  const isCoding = isCodingSessionTool(card);
  const display = isCoding
    ? { ...resolveToolDisplay({ name: card.name, args: card.args }), icon: "code" as const, label: "Code Session" }
    : resolveToolDisplay({ name: card.name, args: card.args });
  const detail = formatToolDetail(display);
  const hasText = Boolean(card.text?.trim());
  const toolName = card.name.toLowerCase();
  const isFileTool = FILE_TOOL_NAMES.has(toolName);
  const filePath = isFileTool ? extractFilePathFromCard(card) : undefined;

  const canClick = Boolean(
    (isCoding && onOpenCodingSession) || onOpenSidebar || (onOpenFilePreview && filePath),
  );
  const handleClick = canClick
    ? () => {
        // Coding session exec → open coding panel
        if (isCoding && onOpenCodingSession) {
          onOpenCodingSession();
          return;
        }
        // For file tools with a path, prefer file preview
        if (onOpenFilePreview && filePath) {
          onOpenFilePreview(filePath);
          return;
        }
        // Fallback to legacy sidebar
        if (onOpenSidebar) {
          if (hasText) {
            onOpenSidebar(formatToolOutputForSidebar(card.text!));
            return;
          }
          const info = `## ${display.label}\n\n${
            detail ? `**Command:** \`${detail}\`\n\n` : ""
          }*No output — tool completed successfully.*`;
          onOpenSidebar(info);
        }
      }
    : undefined;

  const chipTitle = isCoding ? "Open in Code Sessions" : (detail ?? display.label);

  return html`
    <span
      class="chat-tool-chip ${canClick ? "chat-tool-chip--clickable" : ""} ${isCoding ? "chat-tool-chip--coding" : ""}"
      @click=${handleClick}
      role=${canClick ? "button" : nothing}
      tabindex=${canClick ? "0" : nothing}
      @keydown=${
        canClick
          ? (e: KeyboardEvent) => {
              if (e.key !== "Enter" && e.key !== " ") {
                return;
              }
              e.preventDefault();
              handleClick?.();
            }
          : nothing
      }
      title=${chipTitle}
    >
      <span class="chat-tool-chip__icon">${icons[display.icon]}</span>
      <span class="chat-tool-chip__label">${display.label}</span>
      ${detail ? html`<span class="chat-tool-chip__detail">${detail}</span>` : nothing}
    </span>
  `;
}

function normalizeContent(content: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(content)) {
    return [];
  }
  return content.filter(Boolean) as Array<Record<string, unknown>>;
}

function coerceArgs(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return value;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function extractToolText(item: Record<string, unknown>): string | undefined {
  if (typeof item.text === "string") {
    return item.text;
  }
  if (typeof item.content === "string") {
    return item.content;
  }
  return undefined;
}
