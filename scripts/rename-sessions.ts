#!/usr/bin/env bun
/**
 * Backend session renamer: reads session JSONL files, extracts the last N
 * user/assistant messages, calls Claude Haiku via the gateway's OpenAI-compat
 * endpoint to generate short titles, and writes them back to sessions.json.
 *
 * Usage:
 *   bun scripts/rename-sessions.ts [--all] [--dry-run] [--every N]
 *
 * Flags:
 *   --all       Rename all threads (not just unlabeled)
 *   --dry-run   Print titles without writing
 *   --every N   Only rename threads whose message count is a multiple of N
 *               (useful for periodic re-titling; default: rename once)
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const SESSIONS_DIR = join(process.env.HOME!, ".clawdbot/agents/main/sessions");
const SESSIONS_JSON = join(SESSIONS_DIR, "sessions.json");
const CONFIG_PATH = join(process.env.HOME!, ".clawdbot/openclaw.json");

// --- Parse args ---
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const renameAll = args.includes("--all");
const everyIdx = args.indexOf("--every");
const everyN = everyIdx >= 0 ? parseInt(args[everyIdx + 1], 10) : 0;

// --- Read gateway config for auth + port ---
interface GatewayConfig {
  gateway?: {
    port?: number;
    auth?: { token?: string };
  };
}

function loadConfig(): { port: number; token: string } {
  if (!existsSync(CONFIG_PATH)) {
    console.error("No openclaw.json found");
    process.exit(1);
  }
  const cfg: GatewayConfig = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  return {
    port: cfg.gateway?.port ?? 18789,
    token: cfg.gateway?.auth?.token ?? "",
  };
}

// --- Extract user/assistant text messages from a JSONL session file ---
interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

function extractMessages(sessionId: string): ChatMessage[] {
  const filePath = join(SESSIONS_DIR, `${sessionId}.jsonl`);
  if (!existsSync(filePath)) {
    return [];
  }

  const lines = readFileSync(filePath, "utf-8").split("\n");
  const messages: ChatMessage[] = [];

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    try {
      const entry = JSON.parse(line);
      if (entry.type !== "message") {
        continue;
      }

      const role = entry.message?.role;
      if (role !== "user" && role !== "assistant") {
        continue;
      }

      const content = entry.message?.content;
      if (!Array.isArray(content)) {
        continue;
      }

      // Extract text blocks, skip thinking/tool blocks
      const textParts: string[] = [];
      for (const block of content) {
        if (block.type === "text" && typeof block.text === "string") {
          textParts.push(block.text);
        }
      }
      const text = textParts.join("\n").trim();
      if (text) {
        messages.push({ role, text });
      }
    } catch {
      // skip malformed lines
    }
  }
  return messages;
}

// --- Call gateway title endpoint (no session creation) ---
async function generateTitle(
  messages: ChatMessage[],
  port: number,
  token: string,
): Promise<{ title: string; icon: string } | null> {
  // Take last 6 messages (3 exchanges max)
  const recent = messages.slice(-6);
  const chatMsgs = recent.map((m) => ({
    role: m.role,
    content: m.text.slice(0, 300),
  }));

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(`http://localhost:${port}/api/utils/generate-title`, {
      method: "POST",
      headers,
      body: JSON.stringify({ messages: chatMsgs }),
    });

    if (!res.ok) {
      console.error(`  Title API failed: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = (await res.json()) as { title?: string; icon?: string };
    const title = data?.title?.trim();
    if (!title || title.length < 3) {
      return null;
    }
    if (/^\d+$/.test(title)) {
      return null;
    }

    return { title, icon: data?.icon?.trim() ?? "" };
  } catch (err) {
    console.error(`  Title API error: ${err}`);
    return null;
  }
}

// --- Main ---
async function main() {
  const { port, token } = loadConfig();
  console.log(
    `Gateway: localhost:${port}, dry-run: ${dryRun}, all: ${renameAll}, every: ${everyN || "off"}`,
  );

  if (!existsSync(SESSIONS_JSON)) {
    console.error("sessions.json not found");
    process.exit(1);
  }

  const sessions: Record<string, Record<string, unknown>> = JSON.parse(
    readFileSync(SESSIONS_JSON, "utf-8"),
  );

  const threadKeys = Object.keys(sessions).filter((k) => k.includes(":thread:"));
  console.log(`Found ${threadKeys.length} threads\n`);

  let renamed = 0;
  let skipped = 0;

  for (const key of threadKeys) {
    const session = sessions[key];
    const sessionId = session.sessionId as string;
    const currentLabel = (session.label as string) || "";

    // Skip labeled threads unless --all
    if (!renameAll && currentLabel) {
      skipped++;
      continue;
    }

    const messages = extractMessages(sessionId);
    const userMessages = messages.filter((m) => m.role === "user");
    const assistantMessages = messages.filter((m) => m.role === "assistant");

    // Need at least 1 user message
    if (userMessages.length === 0) {
      console.log(`  ${key}: no user messages, skipping`);
      skipped++;
      continue;
    }

    // --every N: only rename if message count is a multiple
    if (everyN > 0 && messages.length % everyN !== 0) {
      skipped++;
      continue;
    }

    const threadId = key.split(":thread:")[1] || key;
    console.log(
      `${threadId}  (${messages.length} msgs, ${userMessages.length}u/${assistantMessages.length}a)`,
    );
    console.log(`  current: "${currentLabel || "(none)"}"`);

    const result = await generateTitle(messages, port, token);
    if (!result) {
      console.log(`  -> failed to generate title`);
      skipped++;
      continue;
    }

    const iconStr = result.icon ? `${result.icon} ` : "";
    console.log(`  -> ${iconStr}"${result.title}"`);

    if (!dryRun) {
      sessions[key] = { ...session, label: result.title };
      if (result.icon) {
        sessions[key].icon = result.icon;
      }
      renamed++;
    } else {
      renamed++;
    }

    console.log();
  }

  if (!dryRun && renamed > 0) {
    writeFileSync(SESSIONS_JSON, JSON.stringify(sessions, null, 2) + "\n");
    console.log(`\nWrote ${renamed} titles to sessions.json`);
  } else {
    console.log(`\n${dryRun ? "[DRY RUN] " : ""}Renamed: ${renamed}, Skipped: ${skipped}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
