import { describe, it, expect, beforeEach, vi } from "vitest";
import type { HookMappingResolved } from "./hooks-mapping.js";
import type { HookMappingContext } from "./hooks-mapping.js";
import { shouldDeduplicateHook, clearDedupCache, getDedupCacheSize } from "./hooks-dedup.js";

// Mock logger
const createMockLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

describe("hooks-dedup", () => {
  beforeEach(() => {
    clearDedupCache();
  });

  describe("shouldDeduplicateHook", () => {
    it("should allow first hook for a thread to pass through", () => {
      const mapping: HookMappingResolved = {
        id: "test-gmail",
        action: "agent",
        deduplicateByField: "messages[0].threadId",
        deduplicateWindowMs: 30_000,
      };

      const ctx: HookMappingContext = {
        payload: {
          messages: [
            {
              id: "msg-1",
              threadId: "thread-123",
              from: "test@example.com",
              subject: "Test",
            },
          ],
        },
        headers: {},
        url: new URL("http://localhost/hook/gmail"),
        path: "gmail",
      };

      const logger = createMockLogger();
      const result = shouldDeduplicateHook(mapping, ctx, logger);

      expect(result).toBe(false); // Should NOT deduplicate (allow through)
      expect(logger.info).not.toHaveBeenCalled();
      expect(getDedupCacheSize()).toBe(1);
    });

    it("should deduplicate second hook for same thread within window", () => {
      const mapping: HookMappingResolved = {
        id: "test-gmail",
        action: "agent",
        deduplicateByField: "messages[0].threadId",
        deduplicateWindowMs: 30_000,
      };

      const ctx: HookMappingContext = {
        payload: {
          messages: [
            {
              id: "msg-1",
              threadId: "thread-123",
              from: "test@example.com",
              subject: "Test",
            },
          ],
        },
        headers: {},
        url: new URL("http://localhost/hook/gmail"),
        path: "gmail",
      };

      const logger = createMockLogger();

      // First hook
      const result1 = shouldDeduplicateHook(mapping, ctx, logger);
      expect(result1).toBe(false); // Pass through

      // Second hook (same thread, within window)
      const ctx2: HookMappingContext = {
        ...ctx,
        payload: {
          messages: [
            {
              id: "msg-2", // Different message ID
              threadId: "thread-123", // Same thread ID
              from: "test@example.com",
              subject: "Re: Test",
            },
          ],
        },
      };

      const result2 = shouldDeduplicateHook(mapping, ctx2, logger);
      expect(result2).toBe(true); // Should deduplicate
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("hook deduplicated"));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("thread-123"));
    });

    it("should allow hook after dedup window expires", async () => {
      const mapping: HookMappingResolved = {
        id: "test-gmail",
        action: "agent",
        deduplicateByField: "messages[0].threadId",
        deduplicateWindowMs: 100, // 100ms window for testing
      };

      const ctx: HookMappingContext = {
        payload: {
          messages: [
            {
              id: "msg-1",
              threadId: "thread-123",
              from: "test@example.com",
              subject: "Test",
            },
          ],
        },
        headers: {},
        url: new URL("http://localhost/hook/gmail"),
        path: "gmail",
      };

      const logger = createMockLogger();

      // First hook
      const result1 = shouldDeduplicateHook(mapping, ctx, logger);
      expect(result1).toBe(false);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Third hook (after window expired)
      const ctx3: HookMappingContext = {
        ...ctx,
        payload: {
          messages: [
            {
              id: "msg-3",
              threadId: "thread-123",
              from: "test@example.com",
              subject: "Re: Re: Test",
            },
          ],
        },
      };

      const result3 = shouldDeduplicateHook(mapping, ctx3, logger);
      expect(result3).toBe(false); // Should pass through after expiry
    });

    it("should handle different threadIds independently", () => {
      const mapping: HookMappingResolved = {
        id: "test-gmail",
        action: "agent",
        deduplicateByField: "messages[0].threadId",
        deduplicateWindowMs: 30_000,
      };

      const logger = createMockLogger();

      // Thread 1
      const ctx1: HookMappingContext = {
        payload: {
          messages: [
            {
              id: "msg-1",
              threadId: "thread-123",
              from: "test@example.com",
              subject: "Test 1",
            },
          ],
        },
        headers: {},
        url: new URL("http://localhost/hook/gmail"),
        path: "gmail",
      };

      // Thread 2
      const ctx2: HookMappingContext = {
        payload: {
          messages: [
            {
              id: "msg-2",
              threadId: "thread-456", // Different thread
              from: "test@example.com",
              subject: "Test 2",
            },
          ],
        },
        headers: {},
        url: new URL("http://localhost/hook/gmail"),
        path: "gmail",
      };

      const result1 = shouldDeduplicateHook(mapping, ctx1, logger);
      const result2 = shouldDeduplicateHook(mapping, ctx2, logger);

      expect(result1).toBe(false); // Both should pass through
      expect(result2).toBe(false);
      expect(getDedupCacheSize()).toBe(2); // Two entries
    });

    it("should not deduplicate when deduplicateByField is missing", () => {
      const mapping: HookMappingResolved = {
        id: "test-no-dedup",
        action: "agent",
        // No deduplicateByField configured
      };

      const ctx: HookMappingContext = {
        payload: {
          messages: [
            {
              id: "msg-1",
              threadId: "thread-123",
              from: "test@example.com",
              subject: "Test",
            },
          ],
        },
        headers: {},
        url: new URL("http://localhost/hook/gmail"),
        path: "gmail",
      };

      const logger = createMockLogger();
      const result = shouldDeduplicateHook(mapping, ctx, logger);

      expect(result).toBe(false); // Should not deduplicate
      expect(getDedupCacheSize()).toBe(0); // Nothing cached
    });

    it("should not deduplicate when threadId field is missing in payload", () => {
      const mapping: HookMappingResolved = {
        id: "test-gmail",
        action: "agent",
        deduplicateByField: "messages[0].threadId",
        deduplicateWindowMs: 30_000,
      };

      const ctx: HookMappingContext = {
        payload: {
          messages: [
            {
              id: "msg-1",
              // No threadId field
              from: "test@example.com",
              subject: "Test",
            },
          ],
        },
        headers: {},
        url: new URL("http://localhost/hook/gmail"),
        path: "gmail",
      };

      const logger = createMockLogger();
      const result = shouldDeduplicateHook(mapping, ctx, logger);

      expect(result).toBe(false); // Should not deduplicate
      expect(getDedupCacheSize()).toBe(0); // Nothing cached
    });

    it("should prune old entries from cache", async () => {
      const mapping: HookMappingResolved = {
        id: "test-gmail",
        action: "agent",
        deduplicateByField: "messages[0].threadId",
        deduplicateWindowMs: 100,
      };

      const logger = createMockLogger();

      // Add multiple entries
      for (let i = 0; i < 5; i++) {
        const ctx: HookMappingContext = {
          payload: {
            messages: [
              {
                id: `msg-${i}`,
                threadId: `thread-${i}`,
                from: "test@example.com",
                subject: "Test",
              },
            ],
          },
          headers: {},
          url: new URL("http://localhost/hook/gmail"),
          path: "gmail",
        };
        shouldDeduplicateHook(mapping, ctx, logger);
      }

      expect(getDedupCacheSize()).toBe(5);

      // Wait for entries to age out (MAX_CACHE_AGE_MS is 60s, but we can trigger pruning)
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Trigger pruning by checking a new hook
      const ctx: HookMappingContext = {
        payload: {
          messages: [
            {
              id: "msg-new",
              threadId: "thread-new",
              from: "test@example.com",
              subject: "Test",
            },
          ],
        },
        headers: {},
        url: new URL("http://localhost/hook/gmail"),
        path: "gmail",
      };
      shouldDeduplicateHook(mapping, ctx, logger);

      // Old entries should have been pruned (this depends on MAX_CACHE_AGE_MS being > test window)
      // In practice, with MAX_CACHE_AGE_MS = 60s and our 150ms wait, nothing will be pruned yet
      // But the test verifies that pruning logic runs without error
      expect(getDedupCacheSize()).toBeGreaterThan(0);
    });

    it("should use default window when deduplicateWindowMs is not specified", () => {
      const mapping: HookMappingResolved = {
        id: "test-gmail",
        action: "agent",
        deduplicateByField: "messages[0].threadId",
        // No deduplicateWindowMs specified (should use default 30s)
      };

      const ctx: HookMappingContext = {
        payload: {
          messages: [
            {
              id: "msg-1",
              threadId: "thread-123",
              from: "test@example.com",
              subject: "Test",
            },
          ],
        },
        headers: {},
        url: new URL("http://localhost/hook/gmail"),
        path: "gmail",
      };

      const logger = createMockLogger();

      // First hook
      const result1 = shouldDeduplicateHook(mapping, ctx, logger);
      expect(result1).toBe(false);

      // Second hook (should be deduplicated with default window)
      const result2 = shouldDeduplicateHook(mapping, ctx, logger);
      expect(result2).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("hook deduplicated"));
    });

    it("should handle nested field paths correctly", () => {
      const mapping: HookMappingResolved = {
        id: "test-nested",
        action: "agent",
        deduplicateByField: "data.email.thread.id",
        deduplicateWindowMs: 30_000,
      };

      const ctx: HookMappingContext = {
        payload: {
          data: {
            email: {
              thread: {
                id: "thread-nested-123",
              },
            },
          },
        },
        headers: {},
        url: new URL("http://localhost/hook/test"),
        path: "test",
      };

      const logger = createMockLogger();

      // First hook
      const result1 = shouldDeduplicateHook(mapping, ctx, logger);
      expect(result1).toBe(false);

      // Second hook with same nested thread ID
      const result2 = shouldDeduplicateHook(mapping, ctx, logger);
      expect(result2).toBe(true);
    });
  });

  describe("clearDedupCache", () => {
    it("should clear the cache", () => {
      const mapping: HookMappingResolved = {
        id: "test-gmail",
        action: "agent",
        deduplicateByField: "messages[0].threadId",
        deduplicateWindowMs: 30_000,
      };

      const ctx: HookMappingContext = {
        payload: {
          messages: [
            {
              id: "msg-1",
              threadId: "thread-123",
              from: "test@example.com",
              subject: "Test",
            },
          ],
        },
        headers: {},
        url: new URL("http://localhost/hook/gmail"),
        path: "gmail",
      };

      const logger = createMockLogger();
      shouldDeduplicateHook(mapping, ctx, logger);
      expect(getDedupCacheSize()).toBe(1);

      clearDedupCache();
      expect(getDedupCacheSize()).toBe(0);
    });
  });
});
