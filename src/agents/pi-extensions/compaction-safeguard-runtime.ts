export type CompactionSafeguardRuntimeValue = {
  maxHistoryShare?: number;
  contextWindowTokens?: number;
  /** Custom instructions appended to compaction summarization prompts. */
  customInstructions?: string;
  /**
   * Minimum token count to trigger actual summarization.
   * Below this threshold, the previous summary is preserved as-is to prevent
   * double-compaction from degrading context. Default: 10000.
   */
  minTokensForCompaction?: number;
};

// Session-scoped runtime registry keyed by object identity.
// Follows the same WeakMap pattern as context-pruning/runtime.ts.
const REGISTRY = new WeakMap<object, CompactionSafeguardRuntimeValue>();

export function setCompactionSafeguardRuntime(
  sessionManager: unknown,
  value: CompactionSafeguardRuntimeValue | null,
): void {
  if (!sessionManager || typeof sessionManager !== "object") {
    return;
  }

  const key = sessionManager;
  if (value === null) {
    REGISTRY.delete(key);
    return;
  }

  REGISTRY.set(key, value);
}

export function getCompactionSafeguardRuntime(
  sessionManager: unknown,
): CompactionSafeguardRuntimeValue | null {
  if (!sessionManager || typeof sessionManager !== "object") {
    return null;
  }

  return REGISTRY.get(sessionManager) ?? null;
}
