/**
 * coding-session-detect.ts — Auto-detect and register coding sessions
 *
 * When an exec tool call spawns a known coding agent (claude, codex, cc, kimi),
 * automatically register it as a coding session so the UI can display it.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { logInfo } from "../logger.js";

/** Pattern to detect coding agent commands. */
const CODING_AGENT_RE = /^(claude|codex|cc|kimi)\b/;

export type CodingSessionRegistrationContext = {
  sessionKey?: string;
  channel?: string;
  to?: string;
  threadId?: string | number;
  accountId?: string;
};

function normalizeContext(context?: CodingSessionRegistrationContext):
  | {
      sessionKey?: string;
      channel?: string;
      to?: string;
      threadId?: string | number;
      accountId?: string;
    }
  | undefined {
  if (!context) {
    return undefined;
  }
  const sessionKey =
    typeof context.sessionKey === "string" && context.sessionKey.trim()
      ? context.sessionKey.trim()
      : undefined;
  const channel =
    typeof context.channel === "string" && context.channel.trim()
      ? context.channel.trim()
      : undefined;
  const to = typeof context.to === "string" && context.to.trim() ? context.to.trim() : undefined;
  const accountId =
    typeof context.accountId === "string" && context.accountId.trim()
      ? context.accountId.trim()
      : undefined;
  const threadIdRaw =
    typeof context.threadId === "number" && Number.isFinite(context.threadId)
      ? Math.trunc(context.threadId)
      : typeof context.threadId === "string" && context.threadId.trim()
        ? context.threadId.trim()
        : undefined;
  const hasAny =
    Boolean(sessionKey) ||
    Boolean(channel) ||
    Boolean(to) ||
    Boolean(accountId) ||
    threadIdRaw != null;
  if (!hasAny) {
    return undefined;
  }
  return {
    sessionKey,
    channel,
    to,
    threadId: threadIdRaw,
    accountId,
  };
}

export function isCodingAgentCommand(command: string): boolean {
  return CODING_AGENT_RE.test(command.trim());
}

/** Resolve tool name from the command binary. */
function detectCodingTool(command: string): "claude-code" | "codex" | "kimi" | null {
  const trimmed = command.trim();
  if (/^claude\b/.test(trimmed)) {
    return "claude-code";
  }
  if (/^(cc)\b/.test(trimmed)) {
    return "claude-code";
  }
  if (/^codex\b/.test(trimmed)) {
    return "codex";
  }
  if (/^kimi\b/.test(trimmed)) {
    return "kimi";
  }
  return null;
}

function getStateFilePath(): string {
  const workspace =
    process.env.OPENCLAW_WORKSPACE || join(process.env.HOME || "~", ".openclaw", "workspace");
  return join(workspace, "state", "coding-sessions.json");
}

function readState(): { sessions: Record<string, unknown> } {
  const path = getStateFilePath();
  try {
    if (!existsSync(path)) {
      return { sessions: {} };
    }
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return { sessions: {} };
  }
}

function writeState(state: { sessions: Record<string, unknown> }) {
  const path = getStateFilePath();
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(state, null, 2) + "\n");
}

/**
 * If the command matches a coding agent pattern, register it as a coding session.
 * Called after exec spawns the process.
 */
export function maybeRegisterCodingSession(
  command: string,
  execSessionId: string,
  workDir: string,
  context?: CodingSessionRegistrationContext,
): void {
  const trimmed = command.trim();
  if (!isCodingAgentCommand(trimmed)) {
    return;
  }

  const tool = detectCodingTool(trimmed);
  if (!tool) {
    return;
  }
  const normalizedContext = normalizeContext(context);
  const deliveryContext =
    normalizedContext &&
    (normalizedContext.channel ||
      normalizedContext.to ||
      normalizedContext.accountId ||
      normalizedContext.threadId != null)
      ? {
          channel: normalizedContext.channel,
          to: normalizedContext.to,
          accountId: normalizedContext.accountId,
          threadId: normalizedContext.threadId,
        }
      : undefined;

  const id = `coding-${execSessionId}`;
  const session = {
    id,
    name: trimmed.length > 80 ? trimmed.slice(0, 77) + "..." : trimmed,
    status: "running",
    tool,
    execSessionId,
    startedAt: new Date().toISOString(),
    workDir,
    command: trimmed,
    sessionKey: normalizedContext?.sessionKey,
    channel: normalizedContext?.channel,
    to: normalizedContext?.to,
    threadId: normalizedContext?.threadId,
    accountId: normalizedContext?.accountId,
    deliveryContext,
  };

  try {
    const state = readState();
    state.sessions[id] = session;
    writeState(state);
    logInfo(`coding-session: auto-registered ${id} (${tool})`);
  } catch {
    // Non-critical — don't fail the exec
  }
}
