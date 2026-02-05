/**
 * Console log buffer for debugging.
 * Captures all console output and allows copying to clipboard.
 * Filters noise for clean LLM context.
 */

export interface LogEntry {
  level: "log" | "info" | "warn" | "error" | "debug";
  timestamp: number;
  args: unknown[];
}

const MAX_BUFFER_SIZE = 1000;
const buffer: LogEntry[] = [];

// Store original console methods
const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
};

// Patterns to filter out (fluff only - keep meaningful logs)
const NOISE_PATTERNS = [
  /^%c/, // Styled console messages (React DevTools, etc.)
  /Download the React DevTools/,
  /\[vite\] hot updated/, // Dev tooling HMR noise
  /\[vite\] connecting/, // Vite connection noise
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

function formatEntry(entry: LogEntry): string {
  const time = new Date(entry.timestamp).toISOString();
  const level = entry.level.toUpperCase().padEnd(5);
  const message = entry.args.map(formatArg).join(" ");
  return `[${time}] [${level}] ${message}`;
}

function captureLog(level: LogEntry["level"], args: unknown[]): void {
  buffer.push({
    level,
    timestamp: Date.now(),
    args,
  });

  // Trim buffer if too large
  if (buffer.length > MAX_BUFFER_SIZE) {
    buffer.splice(0, buffer.length - MAX_BUFFER_SIZE);
  }
}

// Intercept console methods
function installConsoleInterceptor(): void {
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

// Install on import
installConsoleInterceptor();

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

    // Skip duplicate consecutive messages (within 1 second)
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
 * Get filtered logs as formatted text (for LLM context)
 */
export function getLogsAsText(): string {
  const filtered = getFilteredLogs();
  const header = `=== kOS Console Logs (filtered for LLM context) ===
Captured: ${buffer.length} total, ${filtered.length} after filtering
Exported: ${new Date().toISOString()}
${"=".repeat(50)}

`;
  return header + filtered.map(formatEntry).join("\n");
}

/**
 * Get all logs unfiltered (for debugging)
 */
export function getAllLogsAsText(): string {
  const header = `=== kOS Console Logs (unfiltered) ===
Captured: ${buffer.length} entries
Exported: ${new Date().toISOString()}
${"=".repeat(50)}

`;
  return header + buffer.map(formatEntry).join("\n");
}

/**
 * Get raw log entries
 */
export function getLogEntries(): LogEntry[] {
  return [...buffer];
}

/**
 * Clear the log buffer
 */
export function clearLogs(): void {
  buffer.length = 0;
}

/**
 * Copy logs to clipboard
 */
export async function copyLogsToClipboard(): Promise<boolean> {
  try {
    const text = getLogsAsText();
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    originalConsole.error("Failed to copy logs:", err);
    return false;
  }
}
