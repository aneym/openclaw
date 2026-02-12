import { stripThinkingTags } from "../format.ts";

const ENVELOPE_PREFIX = /^\[([^\]]+)\]\s*/;
const ENVELOPE_CHANNELS = [
  "WebChat",
  "WhatsApp",
  "Telegram",
  "Signal",
  "Slack",
  "Discord",
  "iMessage",
  "Teams",
  "Matrix",
  "Zalo",
  "Zalo Personal",
  "BlueBubbles",
];

const textCache = new WeakMap<object, string | null>();
const thinkingCache = new WeakMap<object, string | null>();

function looksLikeEnvelopeHeader(header: string): boolean {
  if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z\b/.test(header)) {
    return true;
  }
  if (/\d{4}-\d{2}-\d{2} \d{2}:\d{2}\b/.test(header)) {
    return true;
  }
  return ENVELOPE_CHANNELS.some((label) => header.startsWith(`${label} `));
}

export function stripEnvelope(text: string): string {
  const match = text.match(ENVELOPE_PREFIX);
  if (!match) {
    return text;
  }
  const header = match[1] ?? "";
  if (!looksLikeEnvelopeHeader(header)) {
    return text;
  }
  return text.slice(match[0].length);
}

export function extractText(message: unknown): string | null {
  if (typeof message === "string") {
    return stripThinkingTags(message);
  }
  if (!message || typeof message !== "object") {
    return null;
  }
  const m = message as Record<string, unknown>;
  const role = typeof m.role === "string" ? m.role : "";
  const content = m.content;
  if (typeof content === "string") {
    const processed = role === "assistant" ? stripThinkingTags(content) : stripEnvelope(content);
    return processed;
  }
  if (Array.isArray(content)) {
    const parts = content
      .map((p) => {
        const item = p as Record<string, unknown>;
        if (item.type === "text" && typeof item.text === "string") {
          return item.text;
        }
        return null;
      })
      .filter((v): v is string => typeof v === "string");
    if (parts.length > 0) {
      const joined = parts.join("\n");
      const processed = role === "assistant" ? stripThinkingTags(joined) : stripEnvelope(joined);
      return processed;
    }
  }
  if (typeof m.text === "string") {
    const processed = role === "assistant" ? stripThinkingTags(m.text) : stripEnvelope(m.text);
    return processed;
  }
  return null;
}

export function extractTextCached(message: unknown): string | null {
  if (!message || typeof message !== "object") {
    return extractText(message);
  }
  const obj = message;
  if (textCache.has(obj)) {
    return textCache.get(obj) ?? null;
  }
  const value = extractText(message);
  textCache.set(obj, value);
  return value;
}

export function extractThinking(message: unknown): string | null {
  if (!message || typeof message !== "object") {
    return null;
  }
  const m = message as Record<string, unknown>;
  const content = m.content;
  const parts: string[] = [];
  if (Array.isArray(content)) {
    for (const p of content) {
      const item = p as Record<string, unknown>;
      if (item.type === "thinking" && typeof item.thinking === "string") {
        const cleaned = item.thinking.trim();
        if (cleaned) {
          parts.push(cleaned);
        }
      }
    }
  }
  if (parts.length > 0) {
    return parts.join("\n");
  }

  // Back-compat: older logs may still have <think> tags inside text blocks.
  const rawText = extractRawText(message);
  if (!rawText) {
    return null;
  }
  const matches = [
    ...rawText.matchAll(/<\s*think(?:ing)?\s*>([\s\S]*?)<\s*\/\s*think(?:ing)?\s*>/gi),
  ];
  const extracted = matches.map((m) => (m[1] ?? "").trim()).filter(Boolean);
  return extracted.length > 0 ? extracted.join("\n") : null;
}

export function extractThinkingCached(message: unknown): string | null {
  if (!message || typeof message !== "object") {
    return extractThinking(message);
  }
  const obj = message;
  if (thinkingCache.has(obj)) {
    return thinkingCache.get(obj) ?? null;
  }
  const value = extractThinking(message);
  thinkingCache.set(obj, value);
  return value;
}

export function extractRawText(message: unknown): string | null {
  if (typeof message === "string") {
    return message;
  }
  if (!message || typeof message !== "object") {
    return null;
  }
  const m = message as Record<string, unknown>;
  const content = m.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const parts = content
      .map((p) => {
        const item = p as Record<string, unknown>;
        if (item.type === "text" && typeof item.text === "string") {
          return item.text;
        }
        return null;
      })
      .filter((v): v is string => typeof v === "string");
    if (parts.length > 0) {
      return parts.join("\n");
    }
  }
  if (typeof m.text === "string") {
    return m.text;
  }
  return null;
}

/**
 * Separate <think>/<thinking> blocks from visible text during streaming.
 * Keeps text channel and reasoning channel monotonic and independent.
 */
export function separateThinkingFromText(text: string): { cleanText: string; reasoning: string } {
  const thinkRegex = /<\s*think(?:ing)?\s*>([\s\S]*?)<\s*\/\s*think(?:ing)?\s*>/gi;
  const parts: string[] = [];
  const clean = text.replace(thinkRegex, (_, content) => {
    const extracted = (content as string).trim();
    if (extracted) {
      parts.push(extracted);
    }
    return "";
  });
  // Handle partial/unclosed thinking tags while a response is still streaming.
  const cleanText = clean.replace(/<\s*think(?:ing)?\s*>[\s\S]*$/i, "").trim();
  return { cleanText, reasoning: parts.join("\n") };
}

function isReasoningHeaderLine(line: string): boolean {
  const normalized = line
    .trim()
    .replace(/^[`*_>#\-\s]+/, "")
    .replace(/[`*_\s]+$/, "");
  return /^reasoning:?$/i.test(normalized);
}

export function normalizeReasoningText(text: string): string {
  const originalTrimmed = text.trim();
  if (!originalTrimmed) {
    return "";
  }

  const lines = originalTrimmed.split(/\r?\n/);
  let removedHeader = false;
  while (lines.length > 0 && isReasoningHeaderLine(lines[0])) {
    lines.shift();
    removedHeader = true;
  }
  if (lines.length > 0) {
    const next = lines[0].replace(/^\s*(?:[`*_>#\-\s]+)?reasoning\s*:\s*/i, "").trimStart();
    if (next !== lines[0]) {
      removedHeader = true;
    }
    lines[0] = next;
    if (!lines[0]) {
      lines.shift();
    }
  }
  const normalized = lines.join("\n").trim();
  // If normalization stripped everything, keep original text to avoid dropping
  // terse reasoning payloads like a single "Reasoning" token.
  if (!normalized && removedHeader) {
    return originalTrimmed;
  }
  return normalized;
}

export function formatReasoningMarkdown(text: string): string {
  const trimmed = normalizeReasoningText(text);
  if (!trimmed) {
    return "";
  }
  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `_${line}_`);
  return lines.length ? ["_Reasoning:_", ...lines].join("\n") : "";
}
