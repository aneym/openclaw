/**
 * Hook deduplication logic for preventing duplicate dispatches
 * within a configurable time window.
 */

import type { createSubsystemLogger } from "../logging/subsystem.js";
import type { HookMappingResolved } from "./hooks-mapping.js";
import type { HookMappingContext } from "./hooks-mapping.js";

type SubsystemLogger = ReturnType<typeof createSubsystemLogger>;

/**
 * In-memory deduplication cache: threadId → last dispatch timestamp
 */
const dedupCache = new Map<string, number>();

/**
 * Default deduplication window in milliseconds
 */
const DEFAULT_DEDUP_WINDOW_MS = 30_000; // 30 seconds

/**
 * Maximum age for cache entries before pruning (2x the window)
 */
const MAX_CACHE_AGE_MS = 60_000; // 60 seconds

/**
 * Extract the deduplication key from the payload using the configured field path.
 * Supports dot notation and array indexing (e.g., "messages[0].threadId")
 */
function extractDedupKey(payload: Record<string, unknown>, fieldPath: string): string | undefined {
  if (!fieldPath) {
    return undefined;
  }

  // Parse the field path (supports dot notation and array indexing)
  const parts: Array<string | number> = [];
  const re = /([^.[\]]+)|(\[(\d+)\])/g;
  let match = re.exec(fieldPath);
  while (match) {
    if (match[1]) {
      parts.push(match[1]);
    } else if (match[3]) {
      parts.push(Number(match[3]));
    }
    match = re.exec(fieldPath);
  }

  let current: unknown = payload;
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof part === "number") {
      if (!Array.isArray(current)) {
        return undefined;
      }
      current = current[part] as unknown;
      continue;
    }
    if (typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return typeof current === "string" ? current : undefined;
}

/**
 * Prune old entries from the deduplication cache.
 * Called periodically to prevent unbounded memory growth.
 */
function pruneDedupCache(now: number): void {
  const cutoff = now - MAX_CACHE_AGE_MS;
  for (const [key, timestamp] of dedupCache.entries()) {
    if (timestamp < cutoff) {
      dedupCache.delete(key);
    }
  }
}

/**
 * Check if a hook should be deduplicated based on the mapping configuration.
 * Returns true if the hook should be skipped (deduplicated), false if it should proceed.
 */
export function shouldDeduplicateHook(
  mapping: HookMappingResolved,
  ctx: HookMappingContext,
  logHooks: SubsystemLogger,
): boolean {
  // Only proceed if deduplication is configured
  if (!mapping.deduplicateByField) {
    return false;
  }

  const dedupKey = extractDedupKey(ctx.payload, mapping.deduplicateByField);

  // If we can't extract a dedup key, let the hook through (no dedup)
  if (!dedupKey) {
    return false;
  }

  const now = Date.now();
  const windowMs = mapping.deduplicateWindowMs ?? DEFAULT_DEDUP_WINDOW_MS;
  const lastDispatch = dedupCache.get(dedupKey);

  // Prune old entries periodically
  pruneDedupCache(now);

  if (lastDispatch !== undefined) {
    const ageMs = now - lastDispatch;
    if (ageMs < windowMs) {
      // Within dedup window — skip this hook
      const ageSec = (ageMs / 1000).toFixed(1);
      logHooks.info(`hook deduplicated (mapping=${mapping.id}, key=${dedupKey}, age=${ageSec}s)`);
      return true;
    }
  }

  // New or expired — record timestamp and proceed
  dedupCache.set(dedupKey, now);
  return false;
}

/**
 * Clear the deduplication cache (primarily for testing)
 */
export function clearDedupCache(): void {
  dedupCache.clear();
}

/**
 * Get the current size of the deduplication cache (for testing/monitoring)
 */
export function getDedupCacheSize(): number {
  return dedupCache.size;
}
