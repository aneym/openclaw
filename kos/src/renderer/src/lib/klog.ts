/**
 * Debug logging module for kOS.
 * Enable/disable categories by setting them in localStorage or code.
 *
 * Usage:
 *   import { klog } from '../lib/klog'
 *   klog.gateway('event received', { event, payload })
 *   klog.messages('loading history', sessionKey)
 *
 * Enable in console:
 *   localStorage.setItem('kos:debug', 'gateway,messages,compose,session')
 *   location.reload()
 *
 * Enable all:
 *   localStorage.setItem('kos:debug', '*')
 */

type LogFn = (...args: unknown[]) => void;

const STORAGE_KEY = "kos:debug";

// Parse enabled categories from localStorage
function getEnabledCategories(): Set<string> | "all" {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return new Set();
    if (stored === "*") return "all";
    return new Set(stored.split(",").map((s) => s.trim().toLowerCase()));
  } catch {
    return new Set();
  }
}

let enabledCategories = getEnabledCategories();

// Listen for storage changes (for hot-reload of debug settings)
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      enabledCategories = getEnabledCategories();
    }
  });
}

function isEnabled(category: string): boolean {
  if (enabledCategories === "all") return true;
  return enabledCategories.has(category.toLowerCase());
}

function createLogger(category: string, color: string): LogFn {
  return (...args: unknown[]) => {
    if (!isEnabled(category)) return;
    console.log(`%c[${category}]`, `color: ${color}; font-weight: bold`, ...args);
  };
}

function createWarnLogger(category: string): LogFn {
  return (...args: unknown[]) => {
    if (!isEnabled(category)) return;
    console.warn(`[${category}]`, ...args);
  };
}

function createErrorLogger(category: string): LogFn {
  return (...args: unknown[]) => {
    // Errors always log, regardless of debug setting
    console.error(`[${category}]`, ...args);
  };
}

export const klog = {
  // Gateway client and events
  gateway: createLogger("gateway", "#00bcd4"),
  gatewayWarn: createWarnLogger("gateway"),
  gatewayError: createErrorLogger("gateway"),

  // Message loading and display
  messages: createLogger("messages", "#4caf50"),
  messagesWarn: createWarnLogger("messages"),
  messagesError: createErrorLogger("messages"),

  // Compose bar and sending
  compose: createLogger("compose", "#ff9800"),
  composeWarn: createWarnLogger("compose"),
  composeError: createErrorLogger("compose"),

  // Session sync
  session: createLogger("session", "#9c27b0"),
  sessionWarn: createWarnLogger("session"),
  sessionError: createErrorLogger("session"),

  // Streaming
  streaming: createLogger("streaming", "#e91e63"),
  streamingWarn: createWarnLogger("streaming"),
  streamingError: createErrorLogger("streaming"),

  // Panel system
  panels: createLogger("panels", "#607d8b"),

  // Generic log (always logs when any category is enabled)
  log: (...args: unknown[]) => {
    if (enabledCategories === "all" || (enabledCategories as Set<string>).size > 0) {
      console.log("[kos]", ...args);
    }
  },

  // Check if a category is enabled (for expensive debug operations)
  isEnabled,

  // Programmatically enable categories
  enable: (categories: string | string[]) => {
    const cats = Array.isArray(categories) ? categories : [categories];
    if (enabledCategories === "all") return;
    cats.forEach((c) => (enabledCategories as Set<string>).add(c.toLowerCase()));
    localStorage.setItem(STORAGE_KEY, [...(enabledCategories as Set<string>)].join(","));
  },

  // Programmatically disable categories
  disable: (categories: string | string[]) => {
    const cats = Array.isArray(categories) ? categories : [categories];
    if (enabledCategories === "all") {
      enabledCategories = new Set([
        "gateway",
        "messages",
        "compose",
        "session",
        "streaming",
        "panels",
      ]);
    }
    cats.forEach((c) => (enabledCategories as Set<string>).delete(c.toLowerCase()));
    localStorage.setItem(STORAGE_KEY, [...(enabledCategories as Set<string>)].join(","));
  },

  // Enable all logging
  enableAll: () => {
    enabledCategories = "all";
    localStorage.setItem(STORAGE_KEY, "*");
  },

  // Disable all logging
  disableAll: () => {
    enabledCategories = new Set();
    localStorage.removeItem(STORAGE_KEY);
  },
};

// Expose klog on window for easy console access
if (typeof window !== "undefined") {
  (window as unknown as { klog: typeof klog }).klog = klog;
}
