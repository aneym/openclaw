/**
 * Server-side session auto-titling.
 *
 * After the first successful agent reply in a session, generates a short
 * title + emoji via Haiku and writes it to the session store. Fire-and-forget —
 * errors are logged, never thrown. User-set labels are never overwritten.
 */
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OpenClawConfig } from "../../config/config.js";
import {
  resolveAgentDir,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
} from "../../agents/agent-scope.js";
import { runAgent } from "../../agents/runtime-dispatcher.js";
import { type SessionEntry, updateSessionStoreEntry } from "../../config/sessions.js";
import { resolveSessionTranscriptCandidates } from "../../gateway/session-utils.fs.js";
import { logVerbose } from "../../globals.js";

const TITLE_MODEL = "claude-haiku-4-5";
const TITLE_TIMEOUT_MS = 15_000;
const MAX_LINES_TO_SCAN = 200;
const MAX_USER_TEXT_LEN = 500;
const MAX_ASST_TEXT_LEN = 300;
const CLIENT_TITLE_MAX_LEN = 40;
/** Re-title every N user exchanges to keep the title relevant. */
const RETITLE_INTERVAL = 10;

/**
 * Track exchange count at last title attempt per session.
 * Prevents concurrent duplicate work and enables periodic re-titling.
 */
const titledAtExchange = new Map<string, number>();

/** Visible for testing — reset the in-memory dedup map. */
export function _resetTitledSessions(): void {
  titledAtExchange.clear();
}

/**
 * Attempt to auto-generate a title for a session after its first exchange,
 * and periodically re-title every RETITLE_INTERVAL exchanges to keep it relevant.
 * Fire-and-forget — errors are logged, never thrown.
 * Never overwrites user-set labels (detected via autoTitle flag).
 */
export async function maybeAutoTitleSession(params: {
  sessionKey: string;
  storePath: string;
  sessionEntry: SessionEntry;
  sessionId: string;
  /** The session file path (for reading transcript) */
  sessionFile?: string;
  config: OpenClawConfig;
}): Promise<void> {
  const { sessionKey, storePath, sessionEntry, sessionId, config } = params;

  // Skip subagent/temp/cron sessions
  if (sessionKey.startsWith("subagent:")) {
    return;
  }
  if (sessionKey.startsWith("temp:")) {
    return;
  }
  if (sessionKey.includes("cron")) {
    return;
  }

  // If session has a label that was NOT auto-generated, never touch it
  const hasLabel = Boolean(sessionEntry.label?.trim());
  const isAutoTitle = sessionEntry.autoTitle === true;
  if (hasLabel && !isAutoTitle) {
    return;
  }

  let tempSessionFile: string | null = null;

  try {
    // Count exchanges and extract context from transcript
    const context = extractTitleContext(sessionId, storePath, params.sessionFile);
    if (!context) {
      return;
    }

    const { exchangeCount } = context;
    const lastTitledAt = titledAtExchange.get(sessionKey) ?? 0;

    // First title: after first exchange (exchangeCount >= 1)
    // Re-title: every RETITLE_INTERVAL exchanges after that
    const isFirstTitle = !hasLabel && lastTitledAt === 0;
    const isRetitle = hasLabel && isAutoTitle && exchangeCount - lastTitledAt >= RETITLE_INTERVAL;

    if (!isFirstTitle && !isRetitle) {
      return;
    }

    // Mark early to prevent concurrent attempts
    titledAtExchange.set(sessionKey, exchangeCount);

    // For re-titles, use recent messages; for first title, use earliest messages
    const titleContext = isRetitle ? context.recentText : context.earlyText;
    const currentLabel = isRetitle ? (sessionEntry.label ?? "") : "";

    // Try LLM-based title generation
    let titleResult: { title: string; icon: string } | null = null;
    try {
      titleResult = await generateTitle({
        userText: titleContext.userText,
        assistantText: titleContext.assistantText,
        currentTitle: currentLabel,
        config,
        getTempSessionFile: () => {
          if (!tempSessionFile) {
            const dir = path.join(os.tmpdir(), `openclaw-autotitle-${Date.now()}`);
            fs.mkdirSync(dir, { recursive: true });
            tempSessionFile = path.join(dir, "session.jsonl");
          }
          return tempSessionFile;
        },
      });
    } catch {
      // LLM failed — fall through to client-side fallback
    }

    // Fall back to client-side heuristic (only for first title, not re-titles)
    if (!titleResult && isFirstTitle) {
      const fallbackTitle = deriveClientSideTitle(titleContext.userText);
      if (!fallbackTitle) {
        return;
      }
      titleResult = { title: fallbackTitle, icon: "" };
    }

    if (!titleResult) {
      return;
    }

    // Write to session store — guard against user having renamed in the meantime
    const finalResult = titleResult;
    await updateSessionStoreEntry({
      storePath,
      sessionKey,
      update: async (entry) => {
        // If label exists and wasn't auto-generated, don't overwrite
        if (entry.label?.trim() && entry.autoTitle !== true) {
          return null;
        }
        return {
          label: finalResult.title,
          icon: finalResult.icon || undefined,
          autoTitle: true,
          updatedAt: Date.now(),
        };
      },
    });

    logVerbose(
      `auto-titled session ${sessionKey} (exchange ${exchangeCount}): ${titleResult.icon} ${titleResult.title}`.trim(),
    );
  } catch (err) {
    logVerbose(`auto-title failed for ${sessionKey}: ${String(err)}`);
  } finally {
    // Clean up temp session file
    if (tempSessionFile) {
      try {
        await fsPromises.rm(path.dirname(tempSessionFile), { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

type TranscriptMessage = {
  role?: string;
  content?: string | Array<{ type: string; text?: string }>;
};

function extractTextFromContent(content: TranscriptMessage["content"]): string | null {
  if (typeof content === "string") {
    return content.trim() || null;
  }
  if (!Array.isArray(content)) {
    return null;
  }
  for (const part of content) {
    if (!part || typeof part.text !== "string") {
      continue;
    }
    if (part.type === "text" || part.type === "output_text" || part.type === "input_text") {
      const trimmed = part.text.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return null;
}

type TitleTextPair = { userText: string; assistantText: string };

type TitleContext = {
  exchangeCount: number;
  earlyText: TitleTextPair;
  recentText: TitleTextPair;
};

/** Extract exchange count plus early and recent user/assistant text from a session transcript. */
export function extractTitleContext(
  sessionId: string,
  storePath: string,
  sessionFile?: string,
): TitleContext | null {
  const candidates = resolveSessionTranscriptCandidates(sessionId, storePath, sessionFile);
  const filePath = candidates.find((p) => fs.existsSync(p));
  if (!filePath) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    if (!raw.trim()) {
      return null;
    }

    const lines = raw.split(/\r?\n/).slice(0, MAX_LINES_TO_SCAN);

    const earlyUserTexts: string[] = [];
    const earlyAssistantTexts: string[] = [];
    const recentUserTexts: string[] = [];
    const recentAssistantTexts: string[] = [];
    let exchangeCount = 0;

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      try {
        const parsed = JSON.parse(line);
        const msg = parsed?.message as TranscriptMessage | undefined;
        if (!msg?.role) {
          continue;
        }
        const text = extractTextFromContent(msg.content);
        if (!text) {
          continue;
        }

        if (msg.role === "user") {
          exchangeCount++;
          if (earlyUserTexts.length < 3) {
            earlyUserTexts.push(text);
          }
          // Keep a sliding window of recent user texts
          recentUserTexts.push(text);
          if (recentUserTexts.length > 3) {
            recentUserTexts.shift();
          }
        } else if (msg.role === "assistant") {
          if (earlyAssistantTexts.length < 2) {
            earlyAssistantTexts.push(text);
          }
          recentAssistantTexts.push(text);
          if (recentAssistantTexts.length > 2) {
            recentAssistantTexts.shift();
          }
        }
      } catch {
        // skip malformed lines
      }
    }

    if (earlyUserTexts.length === 0) {
      return null;
    }

    return {
      exchangeCount,
      earlyText: {
        userText: earlyUserTexts.join("\n").slice(0, MAX_USER_TEXT_LEN),
        assistantText: earlyAssistantTexts.join("\n").slice(0, MAX_ASST_TEXT_LEN),
      },
      recentText: {
        userText: recentUserTexts.join("\n").slice(0, MAX_USER_TEXT_LEN),
        assistantText: recentAssistantTexts.join("\n").slice(0, MAX_ASST_TEXT_LEN),
      },
    };
  } catch {
    return null;
  }
}

/** Call the title model (Haiku) to generate a title + icon. */
export async function generateTitle(params: {
  userText: string;
  assistantText: string;
  /** If set, this is a re-title — the LLM should refine or replace this title. */
  currentTitle?: string;
  config: OpenClawConfig;
  getTempSessionFile: () => string;
}): Promise<{ title: string; icon: string } | null> {
  const { userText, assistantText, currentTitle, config } = params;
  const agentId = resolveDefaultAgentId(config);
  const workspaceDir = resolveAgentWorkspaceDir(config, agentId);
  const agentDir = resolveAgentDir(config, agentId);
  const tempSessionFile = params.getTempSessionFile();

  const lines: string[] = [];

  if (currentTitle) {
    lines.push(
      `The current title of this conversation is: "${currentTitle}"`,
      "The conversation has continued. Update the title to reflect the current topic if it has shifted.",
      "If the current title is still accurate, you may keep it (return it unchanged).",
      "Generate a short, descriptive title (3-6 words) and a single topic emoji.",
    );
  } else {
    lines.push(
      "Generate a short, descriptive title (3-6 words) and a single topic emoji for this conversation.",
      "Summarize the TOPIC being discussed — do NOT just quote or paraphrase the user's message.",
      "Avoid generic titles like 'Quick Chat' or 'Hello' — be specific about the subject matter.",
    );
  }

  lines.push(
    "Reply with ONLY: emoji title",
    "Examples:",
    "  🔧 Fix Login Page Bug",
    "  📊 Server-Side Session Titling",
    "  🏠 Smart Home Automation Setup",
    "",
    `User: ${userText}`,
    assistantText ? `\nAssistant: ${assistantText}` : "",
  );

  const prompt = lines.join("\n");

  const result = await runAgent({
    sessionId: `title-gen-${Date.now()}`,
    sessionKey: "temp:title-generator",
    sessionFile: tempSessionFile,
    workspaceDir,
    agentDir,
    config,
    prompt,
    model: TITLE_MODEL,
    provider: "anthropic",
    disableTools: true,
    timeoutMs: TITLE_TIMEOUT_MS,
    runId: `title-gen-${Date.now()}`,
  });

  const rawText =
    result.payloads
      ?.map((p) => p.text ?? "")
      .join("")
      .trim() ?? "";

  const cleaned = rawText
    .replace(/^["']+|["']+$/g, "")
    .replace(/\*+/g, "")
    .trim();

  if (!cleaned) {
    return null;
  }

  return parseTitleResponse(cleaned);
}

/** Parse "emoji title" format from LLM response. */
export function parseTitleResponse(cleaned: string): { title: string; icon: string } | null {
  if (!cleaned) {
    return null;
  }

  const segments = [...new Intl.Segmenter().segment(cleaned)];
  const firstSeg = segments[0]?.segment ?? "";
  const isEmoji = firstSeg && !/^[a-zA-Z0-9]/.test(firstSeg);

  if (isEmoji) {
    const title = cleaned.slice(firstSeg.length).trim();
    return title ? { title, icon: firstSeg } : null;
  }

  return { title: cleaned, icon: "" };
}

/**
 * Client-side fallback: derive title from first user message.
 * Takes the first sentence (up to a period/question mark/newline) and
 * caps it at 40 characters.
 */
export function deriveClientSideTitle(firstUserMessage: string): string {
  const cleaned = firstUserMessage.replace(/^\/\w+\s*/, "").trim();
  if (!cleaned) {
    return "";
  }

  const match = cleaned.match(/^[^\n.!?]+[.!?]?/);
  const sentence = match ? match[0].trim() : cleaned;

  if (sentence.length <= CLIENT_TITLE_MAX_LEN) {
    return sentence;
  }
  const truncated = sentence.slice(0, CLIENT_TITLE_MAX_LEN);
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > 20 ? truncated.slice(0, lastSpace) + "…" : truncated + "…";
}
