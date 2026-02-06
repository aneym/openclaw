/**
 * Devtools handlers for agent introspection into kOS state.
 * Called from client.ts when node.invoke routes devtools.* commands.
 */

import { getLogEntries } from "../lib/log-buffer";

// Lazy store registry — avoids circular imports by importing at call time
type StoreEntry = { name: string; getState: () => unknown };

let storeRegistry: StoreEntry[] | null = null;

async function getStoreRegistry(): Promise<StoreEntry[]> {
  if (storeRegistry) return storeRegistry;

  const { useBrowserStore } = await import("../stores/browser-store");
  const { useChatStore } = await import("../stores/chat-store");
  const { useDashboardStore } = await import("../stores/dashboard-store");
  const { useGatewayStore } = await import("../stores/gateway-store");
  const { useLinearStore } = await import("../stores/linear-store");
  const { useNotificationStore } = await import("../stores/notification-store");
  const { usePanelStore } = await import("../stores/panel-store");
  const { useProfileStore } = await import("../stores/profile-store");
  const { useProjectStore } = await import("../stores/project-store");
  const { useSettingsStore } = await import("../stores/settings-store");
  const { useSidebarUIStore } = await import("../stores/sidebar-ui-store");
  const { useSimulatorStore } = await import("../stores/simulator-store");
  const { useTaskStore } = await import("../stores/task-store");
  const { useThemeStore } = await import("../stores/theme-store");
  const { useWorkspaceStore } = await import("../stores/workspace-store");

  storeRegistry = [
    { name: "browser", getState: useBrowserStore.getState },
    { name: "chat", getState: useChatStore.getState },
    { name: "dashboard", getState: useDashboardStore.getState },
    { name: "gateway", getState: useGatewayStore.getState },
    { name: "linear", getState: useLinearStore.getState },
    { name: "notification", getState: useNotificationStore.getState },
    { name: "panel", getState: usePanelStore.getState },
    { name: "profile", getState: useProfileStore.getState },
    { name: "project", getState: useProjectStore.getState },
    { name: "settings", getState: useSettingsStore.getState },
    { name: "sidebarUI", getState: useSidebarUIStore.getState },
    { name: "simulator", getState: useSimulatorStore.getState },
    { name: "task", getState: useTaskStore.getState },
    { name: "theme", getState: useThemeStore.getState },
    { name: "workspace", getState: useWorkspaceStore.getState },
  ];
  return storeRegistry;
}

// -- Safe serialization for Maps, Sets, circular refs, functions --

const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 200;
const MAX_STRING_LENGTH = 2000;

function safeSerialize(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > MAX_DEPTH) return "[max depth]";

  if (value === null || value === undefined) return value;
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "symbol") return value.toString();

  if (typeof value === "function") {
    return `[Function: ${value.name || "anonymous"}]`;
  }

  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH
      ? value.slice(0, MAX_STRING_LENGTH) + `... (${value.length} chars)`
      : value;
  }

  if (typeof value !== "object") return String(value);

  // Circular reference check
  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (value instanceof Map) {
    const entries: Record<string, unknown> = {};
    let count = 0;
    for (const [k, v] of value) {
      if (count >= MAX_ARRAY_ITEMS) {
        entries["...truncated"] = `${value.size - count} more entries`;
        break;
      }
      entries[String(k)] = safeSerialize(v, depth + 1, seen);
      count++;
    }
    return { __type: "Map", size: value.size, entries };
  }

  if (value instanceof Set) {
    const items: unknown[] = [];
    let count = 0;
    for (const v of value) {
      if (count >= MAX_ARRAY_ITEMS) {
        items.push(`...${value.size - count} more`);
        break;
      }
      items.push(safeSerialize(v, depth + 1, seen));
      count++;
    }
    return { __type: "Set", size: value.size, items };
  }

  if (value instanceof Date) return value.toISOString();
  if (value instanceof RegExp) return value.toString();
  if (value instanceof Error) return { name: value.name, message: value.message };

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((v) => safeSerialize(v, depth + 1, seen));
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`...${value.length - MAX_ARRAY_ITEMS} more`);
    }
    return items;
  }

  // Plain object
  const result: Record<string, unknown> = {};
  const keys = Object.keys(value as Record<string, unknown>);
  for (const key of keys) {
    result[key] = safeSerialize((value as Record<string, unknown>)[key], depth + 1, seen);
  }
  return result;
}

function resolvePath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    if (current instanceof Map) {
      current = current.get(part);
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }
  return current;
}

// -- Handlers --

interface LogParams {
  level?: string;
  limit?: number;
  source?: string;
}

export async function handleDevtoolsLogs(params: LogParams): Promise<unknown> {
  const limit = params.limit ?? 100;
  const results: { source: string; level: string; timestamp: number; message: string }[] = [];

  // Renderer logs
  if (!params.source || params.source === "renderer") {
    const entries = getLogEntries();
    const filtered = params.level ? entries.filter((e) => e.level === params.level) : entries;

    for (const entry of filtered.slice(-limit)) {
      results.push({
        source: "renderer",
        level: entry.level,
        timestamp: entry.timestamp,
        message: entry.args.map(formatLogArg).join(" "),
      });
    }
  }

  // Main process logs (text-based, parse back into entries)
  if (!params.source || params.source === "main") {
    try {
      const mainText = await window.api.logs.getMainLogs();
      const mainEntries = parseMainLogs(mainText);
      const filtered = params.level
        ? mainEntries.filter((e) => e.level === params.level)
        : mainEntries;

      for (const entry of filtered.slice(-limit)) {
        results.push({ source: "main", ...entry });
      }
    } catch {
      // Main logs unavailable — continue with renderer only
    }
  }

  // Sort by timestamp, trim to limit
  results.sort((a, b) => a.timestamp - b.timestamp);
  return { count: results.length, entries: results.slice(-limit) };
}

interface StateParams {
  store?: string;
  path?: string;
}

export async function handleDevtoolsState(params: StateParams): Promise<unknown> {
  const registry = await getStoreRegistry();

  // No store specified — return summary of all stores
  if (!params.store) {
    const summary: Record<string, { keys: string[]; type: string }> = {};
    for (const entry of registry) {
      const state = entry.getState();
      if (state && typeof state === "object") {
        const keys = Object.keys(state as Record<string, unknown>);
        const dataKeys = keys.filter(
          (k) => typeof (state as Record<string, unknown>)[k] !== "function",
        );
        const methodKeys = keys.filter(
          (k) => typeof (state as Record<string, unknown>)[k] === "function",
        );
        summary[entry.name] = {
          keys: dataKeys,
          type: `${dataKeys.length} fields, ${methodKeys.length} methods`,
        };
      }
    }
    return { stores: Object.keys(summary), summary };
  }

  // Find specific store
  const storeEntry = registry.find(
    (e) => e.name === params.store || e.name.toLowerCase() === params.store!.toLowerCase(),
  );
  if (!storeEntry) {
    return {
      error: `Store "${params.store}" not found`,
      available: registry.map((e) => e.name),
    };
  }

  let state = storeEntry.getState();

  // Drill into path if specified
  if (params.path) {
    state = resolvePath(state, params.path);
    if (state === undefined) {
      return { error: `Path "${params.path}" not found in store "${storeEntry.name}"` };
    }
  }

  return {
    store: storeEntry.name,
    path: params.path ?? null,
    state: safeSerialize(state),
  };
}

interface EvalParams {
  expression: string;
}

export async function handleDevtoolsEval(params: EvalParams): Promise<unknown> {
  const { expression } = params;

  if (expression.length > 10_000) {
    return { error: "Expression too long (max 10,000 characters)" };
  }

  try {
    // Indirect eval — runs in renderer global scope
    // oxlint-disable-next-line no-eval
    const fn = new Function(`return (async () => { return (${expression}); })()`);
    const result = await fn();
    const serialized = safeSerialize(result);

    // Enforce output length limit
    const json = JSON.stringify(serialized);
    if (json.length > 10_000) {
      return {
        result: JSON.parse(json.slice(0, 10_000)),
        truncated: true,
        totalLength: json.length,
      };
    }

    return { result: serialized };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    };
  }
}

interface ErrorsParams {
  limit?: number;
  source?: string;
}

export async function handleDevtoolsErrors(params: ErrorsParams): Promise<unknown> {
  // Reuse logs handler with level filter for error + warn
  const limit = params.limit ?? 100;
  const results: { source: string; level: string; timestamp: number; message: string }[] = [];

  // Renderer errors
  if (!params.source || params.source === "renderer") {
    const entries = getLogEntries().filter((e) => e.level === "error" || e.level === "warn");
    for (const entry of entries.slice(-limit)) {
      results.push({
        source: "renderer",
        level: entry.level,
        timestamp: entry.timestamp,
        message: entry.args.map(formatLogArg).join(" "),
      });
    }
  }

  // Main process errors
  if (!params.source || params.source === "main") {
    try {
      const mainText = await window.api.logs.getMainLogs();
      const mainEntries = parseMainLogs(mainText).filter(
        (e) => e.level === "error" || e.level === "warn",
      );
      for (const entry of mainEntries.slice(-limit)) {
        results.push({ source: "main", ...entry });
      }
    } catch {
      // Main logs unavailable
    }
  }

  results.sort((a, b) => a.timestamp - b.timestamp);
  return {
    count: results.length,
    entries: results.slice(-limit),
  };
}

// -- Utilities --

function formatLogArg(arg: unknown): string {
  if (arg === undefined) return "undefined";
  if (arg === null) return "null";
  if (typeof arg === "string") return arg;
  if (typeof arg === "number" || typeof arg === "boolean") return String(arg);
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  try {
    return JSON.stringify(arg, null, 2);
  } catch {
    return String(arg);
  }
}

function parseMainLogs(text: string): { level: string; timestamp: number; message: string }[] {
  const entries: { level: string; timestamp: number; message: string }[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    // Format: [ISO_DATE] [LEVEL] message
    const match = line.match(/^\[(\d{4}-[^\]]+)\]\s+\[(\w+)\s*\]\s+(.+)$/);
    if (match) {
      const timestamp = new Date(match[1]).getTime();
      const level = match[2].trim().toLowerCase();
      entries.push({ level, timestamp, message: match[3] });
    }
  }

  return entries;
}
