#!/usr/bin/env bun
import { spawn } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

type MessageRole = "user" | "assistant";

type Turn = {
  role: MessageRole;
  text: string;
  timestamp?: string;
};

type CliOptions = {
  stateDir: string;
  apiUrl: string;
  profile: string;
  embedVersion: string;
  agents?: string[];
  sinceMs?: number;
  maxSessions?: number;
  maxChars: number;
  maxMessages: number;
  concurrency: number;
  dryRun: boolean;
  resumeFile?: string;
  resetResume: boolean;
  verbose: boolean;
};

type PluginBackfillConfig = {
  dynamicBankId: boolean;
  bankIdPrefix?: string;
};

type SessionTask = {
  key: string;
  agentId: string;
  bankId: string;
  sessionId: string;
  docId: string;
  content: string;
  timestamp?: string;
  filePath: string;
  chunkIndex: number;
  chunkCount: number;
};

type ResumeState = {
  version: 1;
  updatedAt: string;
  completed: string[];
};

const DEFAULT_MAX_CHARS = 12000;
const DEFAULT_MAX_MESSAGES = 48;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_API_URL = "http://localhost:9077";

function stripInlineFilePayloads(value: string): string {
  // Some transcripts include raw binary payloads inside <file>...</file> wrappers.
  return value.replace(/<file\b[^>]*>[\s\S]*?<\/file>/gi, "<file omitted />");
}

function stripControlChars(value: string): string {
  // Null bytes break child_process.spawn args, and other control chars are not useful memory content.
  return value
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ");
}

function printHelp() {
  console.log(`Backfill OpenClaw session JSONL files into Hindsight banks.

Usage:
  bun scripts/hindsight-backfill-sessions.ts [options]

Options:
  --state-dir <path>        OpenClaw state dir (default: ~/.openclaw)
  --api-url <url>           Hindsight API URL (default: ${DEFAULT_API_URL} or $HINDSIGHT_API_URL)
  --profile <name>          hindsight-embed profile (default: openclaw)
  --embed-version <ver>     hindsight-embed version (default: latest)
  --agents <a,b,c>          Agents to include (default: auto-detect)
  --since <YYYY-MM-DD>      Only include sessions modified on/after this date
  --max-sessions <n>        Limit number of session files processed
  --max-chars <n>           Max chars per retained chunk (default: ${DEFAULT_MAX_CHARS})
  --max-messages <n>        Max messages per retained chunk (default: ${DEFAULT_MAX_MESSAGES})
  --concurrency <n>         Concurrent retain commands (default: ${DEFAULT_CONCURRENCY})
  --resume-file <path>      Resume state file path (default: <stateDir>/hindsight-backfill-state.json)
  --reset-resume            Clear resume state before run
  --execute                 Actually queue retains (default is dry-run)
  --dry-run                 Dry-run mode (default)
  --verbose                 Verbose logging
  -h, --help                Show help

Examples:
  bun scripts/hindsight-backfill-sessions.ts --max-sessions 10
  bun scripts/hindsight-backfill-sessions.ts --execute --agents main,payme --concurrency 6
  bun scripts/hindsight-backfill-sessions.ts --execute --since 2026-02-01`);
}

function parsePositiveInt(raw: string, flag: string): number {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Expected a positive integer for ${flag}, got: ${raw}`);
  }
  return value;
}

function parseSinceDate(raw: string): number {
  const stamp = Date.parse(`${raw}T00:00:00`);
  if (Number.isNaN(stamp)) {
    throw new Error(`Invalid --since date: ${raw} (expected YYYY-MM-DD)`);
  }
  return stamp;
}

function parseArgs(argv: string[]): CliOptions {
  const home = os.homedir();
  const defaultStateDir = path.join(home, ".openclaw");
  const envApiUrl = process.env.HINDSIGHT_API_URL;

  const options: CliOptions = {
    stateDir: defaultStateDir,
    apiUrl: typeof envApiUrl === "string" && envApiUrl.trim() ? envApiUrl.trim() : DEFAULT_API_URL,
    profile: "openclaw",
    embedVersion: "latest",
    maxChars: DEFAULT_MAX_CHARS,
    maxMessages: DEFAULT_MAX_MESSAGES,
    concurrency: DEFAULT_CONCURRENCY,
    dryRun: true,
    resetResume: false,
    verbose: false,
  };

  const args = [...argv];
  while (args.length > 0) {
    const arg = args.shift();
    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--state-dir") {
      options.stateDir = args.shift() ?? "";
      continue;
    }
    if (arg === "--api-url") {
      options.apiUrl = args.shift() ?? "";
      continue;
    }
    if (arg === "--profile") {
      options.profile = args.shift() ?? "";
      continue;
    }
    if (arg === "--embed-version") {
      options.embedVersion = args.shift() ?? "";
      continue;
    }
    if (arg === "--agents") {
      const raw = args.shift() ?? "";
      options.agents = raw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      continue;
    }
    if (arg === "--since") {
      options.sinceMs = parseSinceDate(args.shift() ?? "");
      continue;
    }
    if (arg === "--max-sessions") {
      options.maxSessions = parsePositiveInt(args.shift() ?? "", "--max-sessions");
      continue;
    }
    if (arg === "--max-chars") {
      options.maxChars = parsePositiveInt(args.shift() ?? "", "--max-chars");
      continue;
    }
    if (arg === "--max-messages") {
      options.maxMessages = parsePositiveInt(args.shift() ?? "", "--max-messages");
      continue;
    }
    if (arg === "--concurrency") {
      options.concurrency = parsePositiveInt(args.shift() ?? "", "--concurrency");
      continue;
    }
    if (arg === "--resume-file") {
      options.resumeFile = args.shift() ?? "";
      continue;
    }
    if (arg === "--reset-resume") {
      options.resetResume = true;
      continue;
    }
    if (arg === "--execute") {
      options.dryRun = false;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--verbose") {
      options.verbose = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.stateDir.trim()) {
    throw new Error("--state-dir cannot be empty");
  }
  if (!options.apiUrl.trim()) {
    throw new Error("--api-url cannot be empty");
  }
  if (!options.profile.trim()) {
    throw new Error("--profile cannot be empty");
  }
  if (!options.embedVersion.trim()) {
    throw new Error("--embed-version cannot be empty");
  }

  if (!options.resumeFile) {
    options.resumeFile = path.join(options.stateDir, "hindsight-backfill-state.json");
  }

  return options;
}

function normalizeText(value: string): string {
  const cleaned = stripControlChars(stripInlineFilePayloads(value));
  return cleaned
    .replace(/\r\n/g, "\n")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractText(content: unknown): string {
  if (typeof content === "string") {
    return normalizeText(content);
  }
  if (!Array.isArray(content)) {
    return "";
  }
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const record = block as { type?: unknown; text?: unknown };
    if (record.type === "text" && typeof record.text === "string") {
      const text = normalizeText(record.text);
      if (text) {
        parts.push(text);
      }
    }
  }
  return parts.join("\n\n").trim();
}

function formatTurn(role: MessageRole, text: string): string {
  return `[role: ${role}]\n${text}\n[${role}:end]`;
}

function splitLongText(text: string, maxBodyChars: number): string[] {
  if (text.length <= maxBodyChars) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maxBodyChars) {
    // Try to break on paragraph boundary first.
    const window = remaining.slice(0, maxBodyChars);
    const paragraphBreak = window.lastIndexOf("\n\n");
    if (paragraphBreak > Math.floor(maxBodyChars * 0.4)) {
      chunks.push(remaining.slice(0, paragraphBreak).trim());
      remaining = remaining.slice(paragraphBreak).trimStart();
      continue;
    }

    // Then sentence-ish boundary.
    const sentenceBreak = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("! "),
      window.lastIndexOf("? "),
    );
    if (sentenceBreak > Math.floor(maxBodyChars * 0.4)) {
      chunks.push(remaining.slice(0, sentenceBreak + 1).trim());
      remaining = remaining.slice(sentenceBreak + 1).trimStart();
      continue;
    }

    chunks.push(remaining.slice(0, maxBodyChars).trim());
    remaining = remaining.slice(maxBodyChars).trimStart();
  }

  if (remaining.trim()) {
    chunks.push(remaining.trim());
  }
  return chunks.filter(Boolean);
}

type TurnChunk = {
  content: string;
  timestamp?: string;
};

function chunkTurns(turns: Turn[], maxChars: number, maxMessages: number): TurnChunk[] {
  const chunks: TurnChunk[] = [];
  let currentParts: string[] = [];
  let currentChars = 0;
  let currentMessages = 0;
  let currentTimestamp: string | undefined;

  const flush = () => {
    if (currentParts.length === 0) {
      return;
    }
    chunks.push({ content: currentParts.join("\n\n"), timestamp: currentTimestamp });
    currentParts = [];
    currentChars = 0;
    currentMessages = 0;
    currentTimestamp = undefined;
  };

  for (const turn of turns) {
    const maxBodyChars = Math.max(200, maxChars - 80);
    const textPieces = splitLongText(turn.text, maxBodyChars);
    for (const textPiece of textPieces) {
      const formatted = formatTurn(turn.role, textPiece);
      const addChars = formatted.length + (currentParts.length > 0 ? 2 : 0);
      const wouldOverflow = currentChars + addChars > maxChars || currentMessages + 1 > maxMessages;
      if (wouldOverflow) {
        flush();
      }
      currentParts.push(formatted);
      currentChars += formatted.length + (currentParts.length > 1 ? 2 : 0);
      currentMessages += 1;
      // Use the most recent turn timestamp in the chunk so the chunk is anchored in time.
      // (Hindsight only accepts a single timestamp per memory item.)
      currentTimestamp = turn.timestamp ?? currentTimestamp;
    }
  }

  flush();
  return chunks;
}

async function runCommand(
  command: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function runCommandWithStdin(
  command: string,
  args: string[],
  stdinText: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.stdin.write(stdinText);
    child.stdin.end();
  });
}

async function ensureHealthyApi(apiUrl: string) {
  const url = new URL("/health", apiUrl);
  const result = await runCommand("curl", ["-sS", url.toString()]);
  if (result.code !== 0) {
    throw new Error(`Hindsight health check failed:\n${result.stderr || result.stdout}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error(`Could not parse Hindsight /health response:\n${result.stdout}`);
  }
  const status = (parsed as { status?: unknown }).status;
  if (status !== "healthy") {
    throw new Error(`Hindsight health status is not healthy: ${String(status)}`);
  }
}

async function retainViaApi(
  apiUrl: string,
  task: SessionTask,
): Promise<{ ok: boolean; error?: string }> {
  const url = new URL(`/v1/default/banks/${encodeURIComponent(task.bankId)}/memories`, apiUrl);
  const payload = {
    async: true,
    items: [
      {
        content: task.content,
        timestamp: task.timestamp ?? null,
        context: "openclaw backfill",
        document_id: task.docId,
        metadata: {
          agent_id: task.agentId,
          session_id: task.sessionId,
          chunk_index: String(task.chunkIndex),
          chunk_count: String(task.chunkCount),
        },
      },
    ],
  };

  const body = `${JSON.stringify(payload)}\n`;
  const result = await runCommandWithStdin(
    "curl",
    [
      "-sS",
      "-X",
      "POST",
      url.toString(),
      "-H",
      "content-type: application/json",
      "--data-binary",
      "@-",
    ],
    body,
  );
  if (result.code !== 0) {
    return { ok: false, error: (result.stderr || result.stdout).trim() };
  }

  return { ok: true };
}

async function loadPluginBackfillConfig(stateDir: string): Promise<PluginBackfillConfig> {
  const configPath = path.join(stateDir, "openclaw.json");
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw) as {
      plugins?: {
        entries?: {
          "hindsight-openclaw"?: {
            config?: {
              dynamicBankId?: unknown;
              bankIdPrefix?: unknown;
            };
          };
        };
      };
    };
    const pluginConfig = parsed.plugins?.entries?.["hindsight-openclaw"]?.config;
    const dynamicBankId = pluginConfig?.dynamicBankId !== false;
    const bankIdPrefixRaw = pluginConfig?.bankIdPrefix;
    const bankIdPrefix =
      typeof bankIdPrefixRaw === "string" && bankIdPrefixRaw.trim()
        ? bankIdPrefixRaw.trim()
        : undefined;
    return { dynamicBankId, bankIdPrefix };
  } catch {
    return { dynamicBankId: true };
  }
}

function deriveBankId(agentId: string, config: PluginBackfillConfig): string {
  const base = !config.dynamicBankId ? "openclaw" : agentId === "main" ? "openclaw" : agentId;
  return config.bankIdPrefix ? `${config.bankIdPrefix}-${base}` : base;
}

async function detectAgents(stateDir: string): Promise<string[]> {
  const agentsDir = path.join(stateDir, "agents");
  const entries = await fs.readdir(agentsDir, { withFileTypes: true });
  const agentIds: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const sessionsDir = path.join(agentsDir, entry.name, "sessions");
    if (!fsSync.existsSync(sessionsDir)) {
      continue;
    }
    agentIds.push(entry.name);
  }
  return agentIds.toSorted();
}

async function loadResumeState(resumeFile: string, resetResume: boolean): Promise<Set<string>> {
  if (resetResume) {
    return new Set();
  }
  try {
    const raw = await fs.readFile(resumeFile, "utf-8");
    const parsed = JSON.parse(raw) as ResumeState;
    return new Set(parsed.completed ?? []);
  } catch {
    return new Set();
  }
}

async function saveResumeState(resumeFile: string, completed: Set<string>) {
  const payload: ResumeState = {
    version: 1,
    updatedAt: new Date().toISOString(),
    completed: [...completed].toSorted(),
  };
  await fs.mkdir(path.dirname(resumeFile), { recursive: true });
  await fs.writeFile(resumeFile, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

async function collectTasks(
  options: CliOptions,
  bankConfig: PluginBackfillConfig,
): Promise<SessionTask[]> {
  const agentIds =
    options.agents && options.agents.length > 0
      ? options.agents
      : await detectAgents(options.stateDir);
  const tasks: SessionTask[] = [];

  const parseRecordTimestamp = (record: unknown): string | undefined => {
    if (!record || typeof record !== "object") {
      return undefined;
    }
    const raw = (record as { timestamp?: unknown }).timestamp;
    if (typeof raw === "string") {
      const parsed = Date.parse(raw);
      if (!Number.isNaN(parsed)) {
        return new Date(parsed).toISOString();
      }
    }
    const msg = (record as { message?: unknown }).message;
    if (msg && typeof msg === "object") {
      const msgStamp = (msg as { timestamp?: unknown }).timestamp;
      if (typeof msgStamp === "number" && Number.isFinite(msgStamp)) {
        return new Date(msgStamp).toISOString();
      }
      if (typeof msgStamp === "string") {
        const parsed = Date.parse(msgStamp);
        if (!Number.isNaN(parsed)) {
          return new Date(parsed).toISOString();
        }
      }
    }
    return undefined;
  };

  for (const agentId of agentIds) {
    const sessionsDir = path.join(options.stateDir, "agents", agentId, "sessions");
    if (!fsSync.existsSync(sessionsDir)) {
      continue;
    }

    const files = (await fs.readdir(sessionsDir))
      .filter((name) => name.endsWith(".jsonl"))
      .map((name) => path.join(sessionsDir, name));
    files.sort();

    for (const filePath of files) {
      const stat = await fs.stat(filePath);
      if (options.sinceMs && stat.mtimeMs < options.sinceMs) {
        continue;
      }

      const raw = await fs.readFile(filePath, "utf-8");
      const turns: Turn[] = [];
      for (const line of raw.split("\n")) {
        if (!line.trim()) {
          continue;
        }
        let record: unknown;
        try {
          record = JSON.parse(line);
        } catch {
          continue;
        }
        if (!record || typeof record !== "object") {
          continue;
        }
        if ((record as { type?: unknown }).type !== "message") {
          continue;
        }
        const message = (record as { message?: unknown }).message as
          | { role?: unknown; content?: unknown }
          | undefined;
        if (!message || (message.role !== "user" && message.role !== "assistant")) {
          continue;
        }
        const text = extractText(message.content);
        if (!text) {
          continue;
        }
        turns.push({ role: message.role, text, timestamp: parseRecordTimestamp(record) });
      }

      if (turns.length === 0) {
        continue;
      }

      const sessionId = path.basename(filePath, ".jsonl");
      const chunks = chunkTurns(turns, options.maxChars, options.maxMessages);
      const bankId = deriveBankId(agentId, bankConfig);

      for (let i = 0; i < chunks.length; i++) {
        const docId = `bf-${agentId}-${sessionId}-${i + 1}`;
        tasks.push({
          key: `${bankId}:${docId}`,
          agentId,
          bankId,
          sessionId,
          docId,
          content: chunks[i].content,
          timestamp: chunks[i].timestamp,
          filePath,
          chunkIndex: i + 1,
          chunkCount: chunks.length,
        });
      }
    }
  }

  if (options.maxSessions && options.maxSessions > 0) {
    const keepSessionIds = new Set(
      [...new Set(tasks.map((task) => `${task.agentId}:${task.sessionId}`))].slice(
        0,
        options.maxSessions,
      ),
    );
    return tasks.filter((task) => keepSessionIds.has(`${task.agentId}:${task.sessionId}`));
  }

  return tasks;
}

async function runBackfill() {
  const options = parseArgs(process.argv.slice(2));
  const bankConfig = await loadPluginBackfillConfig(options.stateDir);
  const completed = await loadResumeState(options.resumeFile!, options.resetResume);

  console.log(
    JSON.stringify(
      {
        mode: options.dryRun ? "dry-run" : "execute",
        stateDir: options.stateDir,
        apiUrl: options.apiUrl,
        profile: options.profile,
        embedVersion: options.embedVersion,
        agents: options.agents ?? "auto",
        maxChars: options.maxChars,
        maxMessages: options.maxMessages,
        concurrency: options.concurrency,
        resumeFile: options.resumeFile,
        dynamicBankId: bankConfig.dynamicBankId,
        bankIdPrefix: bankConfig.bankIdPrefix ?? null,
      },
      null,
      2,
    ),
  );

  if (!options.dryRun) {
    await ensureHealthyApi(options.apiUrl);
  }

  const allTasks = await collectTasks(options, bankConfig);
  const tasks = allTasks.filter((task) => !completed.has(task.key));
  const skippedFromResume = allTasks.length - tasks.length;

  const chunksByBank = new Map<string, number>();
  const chunksByAgent = new Map<string, number>();
  for (const task of allTasks) {
    chunksByBank.set(task.bankId, (chunksByBank.get(task.bankId) ?? 0) + 1);
    chunksByAgent.set(task.agentId, (chunksByAgent.get(task.agentId) ?? 0) + 1);
  }

  console.log(
    `Prepared ${allTasks.length} chunks (${tasks.length} pending, ${skippedFromResume} already completed).`,
  );
  console.log(
    `Chunks by bank: ${JSON.stringify(Object.fromEntries([...chunksByBank.entries()].toSorted()))}`,
  );
  console.log(
    `Chunks by agent: ${JSON.stringify(Object.fromEntries([...chunksByAgent.entries()].toSorted()))}`,
  );
  if (tasks.length === 0) {
    return;
  }

  let successCount = 0;
  let failureCount = 0;
  let dryRunCount = 0;
  let cursor = 0;
  let nextSaveAt = 50;
  const failures: Array<{ key: string; error: string }> = [];

  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= tasks.length) {
        return;
      }
      const task = tasks[index];

      if (options.dryRun) {
        dryRunCount += 1;
        if (options.verbose || dryRunCount <= 20) {
          console.log(
            `[DRY] ${task.bankId} ${task.docId} (${task.chunkIndex}/${task.chunkCount}) ${task.filePath}`,
          );
        }
        continue;
      }

      // Use the HTTP API so we can supply a real timestamp for temporal reasoning.
      // (The `hindsight` CLI retain command doesn't expose a timestamp flag.)
      const apiResult = await retainViaApi(options.apiUrl, task);
      if (apiResult.ok) {
        successCount += 1;
        completed.add(task.key);
        if (options.verbose || successCount <= 20) {
          console.log(`[OK] ${task.bankId} ${task.docId} (${task.chunkIndex}/${task.chunkCount})`);
        }
        if (successCount >= nextSaveAt) {
          await saveResumeState(options.resumeFile!, completed);
          nextSaveAt += 50;
        }
        continue;
      }

      failureCount += 1;
      const errorText = (apiResult.error ?? "unknown error").trim();
      failures.push({ key: task.key, error: errorText });
      console.error(`[FAIL] ${task.bankId} ${task.docId}: ${errorText}`);
    }
  };

  const concurrency = Math.max(1, Math.min(options.concurrency, tasks.length));
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  if (!options.dryRun) {
    await saveResumeState(options.resumeFile!, completed);
  }

  console.log(
    `Done. success=${successCount} dry_run=${dryRunCount} failures=${failureCount} resume=${options.resumeFile}`,
  );

  if (failures.length > 0) {
    console.log("Failed keys:");
    for (const failure of failures.slice(0, 20)) {
      console.log(`- ${failure.key}`);
    }
    if (failures.length > 20) {
      console.log(`...and ${failures.length - 20} more failures.`);
    }
    process.exitCode = 1;
  }
}

runBackfill().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
