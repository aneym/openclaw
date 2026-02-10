# Streaming Fix Spec

## Problem

Streaming sometimes stops mid-message in the webchat UI. The text freezes and doesn't update, even though the agent is still generating.

## Root Causes (all resolved)

### 1. Delta throttle drops the last chunk before final — FIXED

In `src/gateway/server-chat.ts`, `emitChatDelta` throttles at 150ms intervals. If a delta arrives within 150ms of the last sent delta, it's skipped (the buffer is updated but no WS event is emitted). When `emitChatFinal` fires immediately after, the final event clears `chatStream` on the client, and the last buffered text was never sent as a delta.

**Fix (applied):** In `emitChatDelta`, when a delta is throttled, a deferred flush (setTimeout ~160ms) sends the buffered text if no other delta has been sent since. The timer is cancelled on each new delta call and on final. `emitChatFinal` includes the buffered text in the final payload as a safety net.

### 2. No stream text in the final event on the client side — FIXED

In `ui/src/ui/controllers/chat.ts`, `handleChatEvent` for `state === "final"` immediately sets `chatStream = null`. The final event payload includes the message text, but the client didn't use it to update `chatStream` first. This created a flash where the streaming text disappears until `loadChatHistory` completes.

**Fix (applied):** Before nulling `chatStream` on final, the final payload's message text is appended directly to `chatMessages` (with `_streamFinal: true` marker) so there's no visual gap.

### 3. `dropIfSlow` silently drops delta events — FIXED

In `src/gateway/server-broadcast.ts`, when `bufferedAmount > MAX_BUFFERED_BYTES` and `dropIfSlow: true`, delta events were silently skipped. During heavy agent runs with many tool calls, large `agent` events (broadcast without `dropIfSlow`) fill the WS send buffer. Then small chat delta events (~200 bytes, broadcast with `dropIfSlow: true`) were silently dropped — the client saw the typing indicator forever.

**Fix (applied):** Removed `dropIfSlow: true` from chat delta broadcasts in `sendDeltaPayload`. Chat deltas are tiny and must always reach the client. If the socket buffer is truly full, the broadcast layer closes the slow connection (triggering auto-reconnect + state restore), which is better than silent event loss.

### 4. Reconnect race condition — SELF-HEALING

On WS reconnect, `chatRunId` is cleared to null, then `queryChatStatus` is called async. Delta events arriving between the clear and the status response could be dropped. However, the delta handler adopts `runId` when `chatRunId` is null (`if (!state.chatRunId && payload.runId) { state.chatRunId = payload.runId; }`), so this self-heals.

## Files Modified

- `src/gateway/server-chat.ts` — Delta throttle flush timer + removed `dropIfSlow` from chat deltas
- `ui/src/ui/controllers/chat.ts` — Final transition appends message to chatMessages

## Testing

- Verified via WebSocket test script: deltas stream correctly, final arrives properly
- `pnpm test` passes (server-node-events tests: 3/3 pass)
- No TypeScript errors in modified files
