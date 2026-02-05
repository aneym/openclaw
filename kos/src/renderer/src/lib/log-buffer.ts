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

// Patterns to filter out (only true noise — keep everything else)
const NOISE_PATTERNS = [
  /^%c/, // Styled console messages (React DevTools, etc.)
  /Download the React DevTools/,
  /\[vite\] hot updated/, // Dev tooling HMR noise
  /\[vite\] connecting/, // Vite connection noise
  /\[vite\] connected/, // Vite connection noise
];

// Stack trace frames to strip (framework internals, not app code)
const STACK_NOISE_PATTERNS = [
  /^\s+at (runWithFiberInDEV|processDispatchQueue|dispatchEvent|batchedUpdates|commitHook|commitPassive|reconnectPassive|recursivelyTraverse|performUnitOfWork|workLoopSync|renderRootSync|performWorkOnRoot|flushPassiveEffects|flushPendingEffects|flushSyncWork|flushSpawnedWork|commitRoot|commitRootWhenReady|commitDoubleInvoke|doubleInvokeEffects|performWorkUntilDeadline)\b/,
  /^\s+at Object\.react_stack_bottom_frame\b/,
  /react-dom_client\.js/,
  /react_jsx-dev-runtime\.js/,
];

function isNoise(message: string): boolean {
  return NOISE_PATTERNS.some((pattern) => pattern.test(message));
}

function cleanStack(stack: string): string {
  return stack
    .split("\n")
    .filter((line) => !STACK_NOISE_PATTERNS.some((p) => p.test(line)))
    .join("\n");
}

function formatArg(arg: unknown): string {
  if (arg === undefined) return "undefined";
  if (arg === null) return "null";
  if (typeof arg === "string") {
    // Clean stack traces embedded in string messages
    if (arg.includes("\n    at ")) return cleanStack(arg);
    return arg;
  }
  if (typeof arg === "number" || typeof arg === "boolean") return String(arg);
  if (arg instanceof Error) {
    const stack = arg.stack ? cleanStack(arg.stack) : "";
    return `${arg.name}: ${arg.message}\n${stack}`;
  }
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

// Capture unhandled errors and promise rejections (browser logs these
// directly, bypassing console.error, so the interceptor misses them)
function installGlobalErrorHandlers(): void {
  window.addEventListener("error", (event) => {
    const message = event.error
      ? `${event.error.name || "Error"}: ${event.error.message}\n${event.error.stack || ""}`
      : `${event.message} (${event.filename}:${event.lineno}:${event.colno})`;
    captureLog("error", [`[uncaught] ${message}`]);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? `${reason.name}: ${reason.message}\n${reason.stack || ""}`
        : formatArg(reason);
    captureLog("error", [`[unhandledrejection] ${message}`]);
  });
}

// Install on import
installConsoleInterceptor();
installGlobalErrorHandlers();

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

    // Skip exact duplicate consecutive messages (within 500ms)
    if (
      message === lastMessage &&
      filtered.length > 0 &&
      entry.timestamp - filtered[filtered.length - 1].timestamp < 500
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
  const header = `=== kOS Console Logs ===
Captured: ${buffer.length} total, ${filtered.length} shown (deduped, dev noise removed)
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
