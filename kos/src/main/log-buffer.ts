/**
 * Main process console log buffer for debugging.
 * Filters noise for clean LLM context.
 */

export interface LogEntry {
  level: "log" | "info" | "warn" | "error" | "debug";
  timestamp: number;
  args: unknown[];
}

const MAX_BUFFER_SIZE = 500;
const buffer: LogEntry[] = [];

// Store original console methods
const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
};

// Patterns to filter out (noise for LLM context)
const NOISE_PATTERNS = [
  /Terminal .* not found, will create new/, // Routine terminal creation
  /\[terminal-service\] Creating terminal/, // Routine
  /\[terminal-service\] Loaded .* scrollback/, // Routine
  /\[terminal-service\].*REATTACH/, // Routine HMR reattach
  /\[terminal-service\].*DETACH/, // Routine HMR detach
];

function isNoise(message: string): boolean {
  return NOISE_PATTERNS.some((pattern) => pattern.test(message));
}

function formatArg(arg: unknown): string {
  if (arg === undefined) return "undefined";
  if (arg === null) return "null";
  if (typeof arg === "string") return arg;
  if (typeof arg === "number" || typeof arg === "boolean") return String(arg);
  if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack || ""}`;
  try {
    return JSON.stringify(arg, null, 2);
  } catch {
    return String(arg);
  }
}

function captureLog(level: LogEntry["level"], args: unknown[]): void {
  buffer.push({
    level,
    timestamp: Date.now(),
    args,
  });

  if (buffer.length > MAX_BUFFER_SIZE) {
    buffer.splice(0, buffer.length - MAX_BUFFER_SIZE);
  }
}

// Intercept console methods
export function installConsoleInterceptor(): void {
  console.log = (...args: unknown[]) => {
    captureLog("log", args);
    originalConsole.log(...args);
  };

  console.info = (...args: unknown[]) => {
    captureLog("info", args);
    originalConsole.info(...args);
  };

  console.warn = (...args: unknown[]) => {
    captureLog("warn", args);
    originalConsole.warn(...args);
  };

  console.error = (...args: unknown[]) => {
    captureLog("error", args);
    originalConsole.error(...args);
  };

  console.debug = (...args: unknown[]) => {
    captureLog("debug", args);
    originalConsole.debug(...args);
  };
}

function formatEntry(entry: LogEntry): string {
  const time = new Date(entry.timestamp).toISOString();
  const level = entry.level.toUpperCase().padEnd(5);
  const message = entry.args.map(formatArg).join(" ");
  return `[${time}] [${level}] ${message}`;
}

/**
 * Filter and deduplicate logs for clean LLM context
 */
function getFilteredLogs(): LogEntry[] {
  const filtered: LogEntry[] = [];
  let lastMessage = "";

  for (const entry of buffer) {
    const message = entry.args.map(formatArg).join(" ");

    // Skip noise patterns
    if (isNoise(message)) continue;

    // Skip duplicate consecutive messages
    if (
      message === lastMessage &&
      filtered.length > 0 &&
      entry.timestamp - filtered[filtered.length - 1].timestamp < 1000
    ) {
      continue;
    }

    filtered.push(entry);
    lastMessage = message;
  }

  return filtered;
}

/**
 * Get filtered logs formatted as text (for IPC)
 */
export function getLogsAsText(): string {
  const filtered = getFilteredLogs();
  if (filtered.length === 0) return "(no main process logs)";
  return filtered.map(formatEntry).join("\n");
}
