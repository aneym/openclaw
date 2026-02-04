# Gmail Hook Thread Deduplication - Implementation Summary

## Problem Solved

Gmail Pub/Sub sends separate webhook notifications for each message in an email thread. When someone sends a thread reply, multiple hooks fire within seconds, each spawning an isolated agent session, resulting in duplicate Slack notifications.

## Solution Implemented

### 1. Core Deduplication Module (`src/gateway/hooks-dedup.ts`)

- In-memory deduplication cache using `Map<string, number>` (threadId → timestamp)
- Configurable deduplication window (default: 30 seconds)
- Automatic cache pruning to prevent memory leaks (entries older than 60s)
- Field path extraction supporting dot notation and array indexing (e.g., `messages[0].threadId`)

### 2. Configuration Schema Updates (`src/config/types.hooks.ts`)

Added two new optional fields to `HookMappingConfig`:

- `deduplicateByField?: string` - Field path to extract for deduplication
- `deduplicateWindowMs?: number` - Deduplication window in milliseconds

### 3. Hook Mapping Resolution (`src/gateway/hooks-mapping.ts`)

- Added dedup fields to `HookMappingResolved` type
- Updated Gmail preset to include:
  ```ts
  deduplicateByField: "messages[0].threadId",
  deduplicateWindowMs: 30_000,
  ```
- Modified `applyHookMappings()` to accept optional logger and check deduplication after mapping match
- Updated `normalizeHookMapping()` to carry through dedup configuration

### 4. HTTP Server Integration (`src/gateway/server-http.ts`)

- Updated `applyHookMappings()` call to pass `logHooks` parameter
- No direct dedup logic here - cleanly delegated to hooks-mapping layer

### 5. Comprehensive Tests (`src/gateway/hooks-dedup.test.ts`)

10 test cases covering:

- ✅ First hook for a thread passes through
- ✅ Second hook for same thread within window is deduplicated
- ✅ Hook after window expiry passes through
- ✅ Different threadIds are independent
- ✅ Missing deduplicateByField config = no dedup
- ✅ Missing threadId in payload = no dedup (fallthrough)
- ✅ Cache pruning works
- ✅ Default window (30s) is used when not specified
- ✅ Nested field paths work correctly
- ✅ clearDedupCache() utility works

## Design Decisions

### Why In-Memory?

- Speed: No disk I/O latency
- Simplicity: No persistence layer needed
- Appropriate scope: Dedup window is short (30s), no need for durability
- Bounded size: Automatic pruning prevents unbounded growth

### Why General-Purpose Config?

The `deduplicateByField` approach makes this feature reusable for any webhook that has a similar threading/grouping concept, not just Gmail.

### Why Integrate at Mapping Layer?

Placing the dedup check in `applyHookMappings()` keeps the logic centralized and testable, rather than spreading it across the HTTP handler.

## Files Modified

- Created: `src/gateway/hooks-dedup.ts` (core logic)
- Created: `src/gateway/hooks-dedup.test.ts` (tests)
- Modified: `src/config/types.hooks.ts` (config schema)
- Modified: `src/gateway/hooks-mapping.ts` (integration + Gmail preset)
- Modified: `src/gateway/server-http.ts` (pass logger to mapping)

## Verification

```bash
cd ~/Desktop/openclaw-fork
pnpm build  # ✅ Success
pnpm vitest run src/gateway/hooks-dedup.test.ts  # ✅ 10/10 tests pass
pnpm vitest run src/gateway/hooks-mapping.test.ts  # ✅ 7/7 existing tests pass
```

## Usage Example

For users who want to configure custom deduplication:

```yaml
# config.yaml
hooks:
  mappings:
    - id: my-custom-hook
      match:
        path: my-webhook
      action: agent
      messageTemplate: "New event: {{event.title}}"
      deduplicateByField: "event.conversation_id"
      deduplicateWindowMs: 60000 # 60 seconds
```

## Logging

When deduplication occurs:

```
logHooks.info("hook deduplicated (mapping=gmail, key=thread-123abc, age=2.3s)")
```

## Performance Characteristics

- O(1) cache lookup and insert
- O(n) periodic pruning, where n = cache size (typically < 100 entries)
- Memory: ~100 bytes per cached thread ID
- No blocking I/O

## Future Enhancements (Not Implemented)

- Configurable MAX_CACHE_AGE_MS
- Metrics/monitoring of dedup hit rate
- Redis-based dedup for multi-instance deployments
