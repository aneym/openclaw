# Streaming Fix Plan — Issue #1

Multi-pane streaming is broken because tool stream and chat stream state is **global (host-level)** but the UI supports **multiple concurrent sessions**. Five distinct bugs interact to produce the symptoms: frozen streams, missing tool activity, and stalled responses.

---

## Bug Summaries

### Bug 1: Tool stream events silently dropped for non-focused panes

**Location:** `app-tool-stream.ts:196`

`handleAgentEvent` checks `if (sessionKey && sessionKey !== host.sessionKey) return`. Since `host.sessionKey` is always the focused pane's session, ALL agent events (tool call start, partial results, tool results) for non-focused panes are dropped. The gateway routing in `app-gateway.ts:236-254` correctly identifies visible-pane events and lets them through, but `handleAgentEvent` rejects them anyway.

`toolStreamById`, `toolStreamOrder`, `chatToolMessages`, and `toolStreamSyncTimer` live on the host. There is no per-thread tool stream. `PaneState` already has `toolStreamById` and `toolStreamOrder` fields but they're unused.

**Impact:** Non-focused panes never show tool call activity. Switching focus mid-stream permanently loses tool history.

### Bug 2: `focusPane` snapshot/restore races with in-flight stream events

**Location:** `app.ts:879-953`

`focusPane` synchronously: (1) snapshots host state to old thread, (2) changes `host.sessionKey`, (3) restores target thread state. WebSocket events are async. If a delta arrives between steps 1-3:
- The event targets `host.sessionKey` which may have just changed
- `chatRunId` may be restored as `null` if the target thread had no active run, hiding the stop button
- Stream data from the snapshotted session can be permanently lost

**Impact:** Stream text appears in wrong pane; stop button disappears; stream data lost.

### Bug 3: Chat event lifecycle incomplete for non-focused visible panes

**Location:** `app-gateway.ts:311-343`

The visible-but-not-focused handler does basic delta/final text handling then `return`s early. Skipped operations:
- `handleChatEvent()` full state machine (error handling, run ID reconciliation for sub-agent `final` events)
- `flushChatQueueForEvent()` — queued messages in non-focused panes never send
- `resetToolStream()` on final/error — stale tool stream persists from previous run
- `maybeAutoRenameSession()` — sessions in non-focused panes never get auto-titled

**Impact:** Queued messages stuck; stale tool calls shown; sessions remain unnamed.

### Bug 4: History load collision during pane focus switch

**Location:** `app-gateway.ts:339-341` + `app.ts:879-931`

When `final` arrives for a non-focused visible pane, `loadChatHistoryForThread()` fires async. If the user focuses that pane before the load completes:
1. `focusPane` → `restoreThreadState` copies the thread's **pre-history** messages to host
2. Async history load completes, writes to `thread.chatMessages`
3. Host's `chatMessages` is stale — shows incomplete history until something else triggers a re-render

**Impact:** Pane shows partial/empty history after focus switch, despite data being loaded.

### Bug 5: WebSocket reconnect loses tool stream permanently

**Location:** `app-gateway.ts:163`

`onHello` calls `resetToolStream()` globally, clearing all tool data. `queryChatStatus()` restores `chatRunId` and `chatStream` text (lines 724-766) but not tool stream entries. For split panes, it restores `chatRunId` per-thread but tool streams are gone.

**Impact:** After reconnect, tool call history is permanently lost for all sessions.

---

## Code Changes (File-by-File)

### 1. `ui/src/ui/thread-state.ts` — Add per-thread tool stream state

```
Add to ThreadState interface:
  toolStreamById: Map<string, ToolStreamEntry>
  toolStreamOrder: string[]
  toolStreamSyncTimer: number | null

Update createThreadState():
  toolStreamById: new Map(),
  toolStreamOrder: [],
  toolStreamSyncTimer: null,

Update snapshotThreadState():
  Include toolStreamById, toolStreamOrder, toolStreamSyncTimer

Update restoreThreadState():
  Restore toolStreamById, toolStreamOrder, toolStreamSyncTimer
  Also sync chatToolMessages from the restored tool stream
```

Import `ToolStreamEntry` from `./app-tool-stream`.

### 2. `ui/src/ui/app-tool-stream.ts` — Route events to per-thread tool streams

**Change `handleAgentEvent`** (line 184-241):
- Accept an optional `targetThread: ThreadState` parameter
- When `targetThread` is provided and `sessionKey !== host.sessionKey`, operate on `targetThread.toolStreamById` / `targetThread.toolStreamOrder` / `targetThread.chatToolMessages` instead of the host
- Remove the `if (sessionKey && sessionKey !== host.sessionKey) return` guard (line 196) — the caller now handles routing
- Add a `handleAgentEventForThread(thread: ThreadState, payload)` variant (or make the existing function polymorphic) that operates on ThreadState fields

**Add `resetToolStreamForThread(thread: ThreadState)`**:
- Clears `thread.toolStreamById`, `thread.toolStreamOrder`, `thread.chatToolMessages`
- Mirrors `resetToolStream(host)` but scoped to a thread

**Add `syncToolStreamMessagesForThread(thread: ThreadState)`**:
- Rebuilds `thread.chatToolMessages` from `thread.toolStreamOrder`/`thread.toolStreamById`

### 3. `ui/src/ui/app-gateway.ts` — Full lifecycle for visible panes + routing fix

**Agent event routing (lines 230-255):**
- When `agentSessionKey` matches a visible non-focused pane, look up the `ThreadState` and call `handleAgentEventForThread(thread, agentPayload)` instead of relying on the host-level function
- Keep the host-level call for the focused session

**Chat event visible-pane handler (lines 311-343) — expand to full lifecycle:**

Replace the minimal handler with:
```
if (eventSessionKey && eventSessionKey !== host.sessionKey && isVisibleInPane) {
  const paneThreadId = host.sessionKeyToThreadId.get(eventSessionKey)
  const paneThread = paneThreadId ? host.threads.get(paneThreadId) : null
  if (paneThread && payload) {
    // Apply full chat event state machine to thread
    handleChatEventForThread(paneThread, payload)

    if (payload.state === 'final' || payload.state === 'error' || payload.state === 'aborted') {
      resetToolStreamForThread(paneThread)

      if (payload.state === 'final') {
        // Track in-flight load to prevent focus-switch collision (Bug 4)
        paneThread._historyLoading = true
        void loadChatHistoryForThread(host, eventSessionKey, paneThreadId).then(() => {
          paneThread._historyLoading = false
          // Flush queue for this thread
          void flushChatQueueForThread(host, paneThread)
          void maybeAutoRenameSessionForThread(host, paneThread, eventSessionKey)
        })
      } else {
        void flushChatQueueForThread(host, paneThread)
      }
    }

    paneThread.descriptor.lastActivityAt = Date.now()
    host.threads = new Map(host.threads)
  }
  return
}
```

**Add `handleChatEventForThread(thread: ThreadState, payload: ChatEventPayload)`:**
- Mirrors `handleChatEvent` from `controllers/chat.ts` but operates on ThreadState fields instead of the host
- Handles delta (append stream text), final/error/aborted (clear run state), sub-agent run ID reconciliation

### 4. `ui/src/ui/controllers/chat.ts` — Add thread-scoped variant

**Add `handleChatEventForThread(thread: ThreadState, payload: ChatEventPayload)`:**
```typescript
export function handleChatEventForThread(
  thread: ThreadState,
  payload: ChatEventPayload,
): string | null {
  // Same logic as handleChatEvent but reads/writes thread.chatStream,
  // thread.chatRunId, thread.chatStreamStartedAt instead of state.*
}
```

This avoids the `if (payload.sessionKey !== state.sessionKey) return null` guard that exists in `handleChatEvent` (line 163) which is the reason visible-pane events are rejected.

### 5. `ui/src/ui/app.ts` — Guard focus switch against in-flight loads + event buffering

**`focusPane` (line 879):**

Add an event buffering guard:
```typescript
focusPane(paneId: string) {
  if (paneId === this.focusedPaneId) return

  // If the target thread has an in-flight history load, defer the restore
  const leaf = this.splitLayout ? findLeaf(this.splitLayout.root, paneId) : null
  if (!leaf) return
  const targetThreadId = this.sessionKeyToThreadId.get(leaf.threadId)
  const targetThread = targetThreadId ? this.threads.get(targetThreadId) : null

  // Set a switching flag to prevent event handlers from seeing inconsistent state
  this._switching = true

  // ... existing snapshot/restore logic ...

  this._switching = false

  // If target thread had a pending history load, re-apply thread state
  // after load completes
  if (targetThread?._historyLoading) {
    // Wait for the load and re-restore
    const checkLoad = () => {
      if (!targetThread._historyLoading) {
        if (this.focusedPaneId === paneId) {
          restoreThreadState(this, targetThread)
          this.threads = new Map(this.threads)
        }
      } else {
        setTimeout(checkLoad, 50)
      }
    }
    setTimeout(checkLoad, 50)
  }
}
```

**Alternative (simpler):** Track `_historyLoading: boolean` on ThreadState. In `focusPane`, if the target thread's `_historyLoading` is true, schedule a post-load refresh via a one-shot callback/flag.

### 6. `ui/src/ui/app-gateway.ts` — Reconnect: restore tool stream from active runs

**`queryChatStatus` (line 724-766):**

After restoring `chatRunId` and `chatStream`, also query the gateway for active tool state if available. If the gateway doesn't expose tool stream snapshots, at minimum:
- Don't call `resetToolStream()` on reconnect if an active run exists (defer the reset until after `queryChatStatus` confirms no run)
- Move `resetToolStream()` from `onHello` (line 163) into the `queryChatStatus().then()` handler (line 180-193), only calling it when `!host.chatRunId`

Current code already does this partially (lines 181-185 clear `chatStream` only if no active run), but the `resetToolStream()` at line 163 runs unconditionally before `queryChatStatus` even fires.

**Fix:** Remove `resetToolStream()` from line 163. Add it inside the `.then()` at line 180:
```typescript
void queryChatStatus(host).then(() => {
  if (!host.chatRunId) {
    (host as any).chatStream = null;
    (host as any).chatStreamStartedAt = null;
    resetToolStream(host as any);  // <-- moved here
  }
  for (const thread of host.threads.values()) {
    if (!thread.chatRunId) {
      thread.chatStream = null;
      thread.chatStreamStartedAt = null;
      resetToolStreamForThread(thread);  // <-- per-thread
    }
  }
});
```

### 7. `ui/src/ui/views/chat-pane.ts` — Read tool messages from thread

**Lines 58-59:** Currently reads `state.chatToolMessages` for the active session. This works if tool streams are on the host. After per-thread tool streams:

```typescript
toolMessages: isActiveSession ? state.chatToolMessages : (thread?.chatToolMessages ?? []),
```

This already reads from `thread.chatToolMessages` for non-active sessions, which is correct once we populate it per-thread. No change needed here if `chatToolMessages` on ThreadState is kept in sync.

### 8. `ui/src/ui/pane-state.ts` — Clean up unused tool stream fields

`PaneState` has `toolStreamById` and `toolStreamOrder` but they're never used. Once tool stream lives on `ThreadState`, remove these from `PaneState` to avoid confusion.

---

## Implementation Order

1. **Thread state expansion** (thread-state.ts) — add tool stream fields
2. **Tool stream routing** (app-tool-stream.ts) — add thread-scoped functions
3. **Chat event thread variant** (controllers/chat.ts) — add `handleChatEventForThread`
4. **Gateway routing** (app-gateway.ts) — full lifecycle for visible panes + reconnect fix
5. **Focus switch guard** (app.ts) — history load collision prevention
6. **Pane state cleanup** (pane-state.ts) — remove unused fields
7. **Test** — manual verification with split panes, tool-heavy responses, reconnect

---

## Risks and Edge Cases

### Race conditions during rapid focus switching
If the user clicks between panes rapidly, multiple snapshot/restore cycles can overlap. The `_switching` flag approach assumes synchronous execution within `focusPane`, which holds because the async parts (history load, textarea focus) are deferred. However, the `_historyLoading` polling loop could fire stale if focus moved again. Mitigation: the polling checks `this.focusedPaneId === paneId` before applying.

### Memory usage with per-thread tool streams
Each ThreadState now holds its own tool stream map. With many threads and tool-heavy runs, memory could grow. Mitigation: the existing `TOOL_STREAM_LIMIT = 50` cap should apply per-thread. Inactive threads should have their tool streams cleared on `final`.

### Backward compatibility of `chatToolMessages` on ThreadState
`ThreadState.chatToolMessages` already exists (typed as `unknown[]`). It's populated during snapshot/restore but not during live streaming for non-focused threads. After this fix, it will be actively written to during streaming. No interface change needed.

### Sub-agent `final` events
`handleChatEvent` has special handling for `final` from a different `runId` (line 166-173 in controllers/chat.ts). The thread-scoped variant must replicate this: a sub-agent completing should trigger history reload but not clear the parent run's stream state.

### Existing onboarding mode guard
`app-gateway.ts:231` skips agent events during onboarding. This guard should remain and apply before any per-thread routing.

### `flushChatQueue` for non-focused panes
Currently `flushChatQueue` operates on the host's `chatQueue`. With per-thread queues, a thread-scoped flush is needed. `ThreadState` already has `chatQueue`. A `flushChatQueueForThread(host, thread)` variant should use `thread.chatQueue` and send via `host.client.request('chat.send', { sessionKey: thread.descriptor.sessionKey, ... })`.

### `compactionStatus` scoping
Compaction events (`app-tool-stream.ts:154-182`) are handled globally. In a multi-pane setup, compaction should be scoped to the correct session. This is a lower-priority concern — compaction is rare and short-lived — but worth noting for a follow-up.

### WebSocket `onGap` handling
Seq gaps are logged but not acted on (line 206-208). In a multi-pane scenario with high event throughput, gaps are more likely. No fix needed now, but worth monitoring.
