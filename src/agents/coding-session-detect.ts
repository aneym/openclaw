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

/** Resolve tool name from the command binary. */
function detectCodingTool(command: string): "claude-code" | "codex" | "kimi" | null {
  const trimmed = command.trim();
  if (/^claude\b/.test(trimmed)) return "claude-code";
  if (/^(cc)\b/.test(trimmed)) return "claude-code";
  if (/^codex\b/.test(trimmed)) return "codex";
  if (/^kimi\b/.test(trimmed)) return "kimi";
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
    if (!existsSync(path)) return { sessions: {} };
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return { sessions: {} };
  }
}

function writeState(state: { sessions: Record<string, unknown> }) {
  const path = getStateFilePath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
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
): void {
  const trimmed = command.trim();
  if (!CODING_AGENT_RE.test(trimmed)) return;

  const tool = detectCodingTool(trimmed);
  if (!tool) return;

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
