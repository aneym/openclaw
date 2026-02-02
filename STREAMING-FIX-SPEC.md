# Streaming Reliability Fix — SPEC

## Problem

The webchat UI streaming breaks frequently, requiring page refreshes. This happens especially when multiple sessions/threads are active or when the connection briefly drops. The root causes are:

### Root Cause Analysis

**1. Slow Consumer Disconnect (server-broadcast.ts)**

- When `bufferedAmount > MAX_BUFFERED_BYTES` (16MB), the server **closes the WebSocket with code 1008** ("slow consumer")
- For `dropIfSlow: true` events (chat deltas, agent events, presence), it silently drops them instead
- With multiple concurrent streams, the buffer fills fast → events get dropped or connection killed
- **Key file:** `src/gateway/server-broadcast.ts` lines 48-58

**2. Chat Delta Throttle Creates Stale Buffered Text (server-chat.ts)**

- `emitChatDelta` throttles at 150ms intervals per run
- The text buffer (`chatRunState.buffers`) accumulates the full text, but only broadcasts every 150ms
- If a delta is dropped (dropIfSlow) mid-stream, the client has a gap it can never recover from
- **Key file:** `src/gateway/server-chat.ts` — `emitChatDelta` function

**3. No Stream Recovery After Reconnect (ui/gateway.ts + app-gateway.ts)**

- On reconnect, `onHello` callback nulls out ALL thread stream state: `chatRunId`, `chatStream`, `chatStreamStartedAt`
- `queryChatStatus` only restores the stop button (runId), NOT the accumulated stream text
- If a stream was mid-flight during disconnect, the user sees nothing until the run completes and history is loaded
- **Key file:** `ui/src/ui/app-gateway.ts` — `onHello` callback, `queryChatStatus`

**4. Sequence Gap Detection With No Recovery (ui/gateway.ts)**

- Client tracks `lastSeq` and fires `onGap` when a gap is detected
- The UI sets `lastError` with "event gap detected... refresh recommended" — but takes NO recovery action
- A single dropped event (e.g. from dropIfSlow) triggers this permanently until refresh
- **Key file:** `ui/src/ui/gateway.ts` line 252-254, `app-gateway.ts` `onGap` handler

**5. Agent Event Seq Gap Broadcast Creates Noise (server-chat.ts)**

- When agent event seq has a gap, the server broadcasts a synthetic "seq gap" error agent event
- This adds noise to the stream but doesn't help recovery
- **Key file:** `src/gateway/server-chat.ts` — agent event handler

## Fix Plan

### Fix 1: Add Stream State Recovery on Reconnect

**Files:** `ui/src/ui/app-gateway.ts`, `src/gateway/server-methods/chat.ts`

**Server side:**

- Extend `chat.status` response to include the current buffered stream text for an active run
- Add field: `activeRun.streamText` — returns `chatRunState.buffers.get(runId)` if the run is still active

**Client side:**

- In `queryChatStatus`, if the response includes `activeRun.streamText`, restore it to the thread's `chatStream`
- This means after reconnect, the user immediately sees the accumulated text instead of blank

### Fix 2: Make Sequence Gaps Non-Fatal

**Files:** `ui/src/ui/app-gateway.ts`, `ui/src/ui/gateway.ts`

- Change `onGap` handler from setting a permanent error to logging a warning and continuing
- Remove the "refresh recommended" error message — it's not actionable and blocks the UI
- The gap is harmless for chat events (they're keyed by runId, not global seq)
- Keep the gap detection for debugging (console.warn) but don't surface it to the user

### Fix 3: Improve Slow Consumer Handling

**Files:** `src/gateway/server-broadcast.ts`

- Instead of immediately closing with 1008, add a warning threshold (e.g. 8MB)
- At warning threshold: start dropping `dropIfSlow` events (already happens)
- At kill threshold (16MB): close the connection (already happens)
- Add a `chat.flush` mechanism: when a client reconnects and has an active run, send the full buffered text as the first delta
- This is partially solved by Fix 1 (stream recovery on reconnect)

### Fix 4: Add Delta Catch-Up After Dropped Events

**Files:** `src/gateway/server-chat.ts`

- Track the last successfully-sent delta seq per client per run
- When `dropIfSlow` skips a delta, mark it
- On the next non-dropped delta, send the full buffer (catch-up) instead of just the new text
- This is cheap because the delta is already the full accumulated text

Actually — looking more carefully, the deltas already contain the FULL accumulated text (not incremental). So if a delta is dropped and the next one gets through, the client gets the full text. The real problem is:

- If ALL deltas get dropped until final, the client sees nothing then suddenly the final message
- The 150ms throttle means at most ~7 deltas/second, which is reasonable

The bigger issue is the `dropIfSlow: true` on chat deltas combined with the hard close at 16MB.

### Fix 5: Per-Session Event Filtering (Optimization)

**Files:** `src/gateway/server-broadcast.ts`

Currently ALL events go to ALL WebSocket clients. With multiple concurrent runs, a client viewing session A still receives all the agent/chat events for sessions B, C, D.

- Allow clients to subscribe to specific session keys
- Only broadcast events for subscribed sessions (or all if no subscription)
- This dramatically reduces bandwidth for multi-session setups
- **This is a bigger change** — implement as a follow-up if the simpler fixes don't resolve the issue

### Fix 6: Smarter Reconnect in the Client

**Files:** `ui/src/ui/gateway.ts`

- After reconnect, don't null out stream state immediately
- Instead, call `chat.status` first, THEN reconcile state
- If `chat.status` returns an active run with stream text, keep the stream alive
- Only null out if chat.status confirms no active run

## Implementation Priority

1. **Fix 2** (non-fatal seq gaps) — Quickest win, removes the most user-visible breakage
2. **Fix 1** (stream recovery on reconnect) — Handles the "blank stream after reconnect" case
3. **Fix 6** (smarter reconnect) — Prevents the flash of empty state
4. **Fix 3/4** (slow consumer improvements) — Edge cases with high-throughput multi-stream

## Files to Modify

### Server (src/gateway/)

- `server-methods/chat.ts` — extend `chat.status` response with `streamText`
- `server-broadcast.ts` — (optional) improve slow consumer handling
- `server-chat.ts` — (optional) delta catch-up mechanism

### Client (ui/src/ui/)

- `gateway.ts` — make seq gap non-fatal, improve reconnect flow
- `app-gateway.ts` — stream recovery in `queryChatStatus`, smarter reconnect
- `controllers/chat.ts` — (minor) accept restored stream state

## Testing

After implementing, test by:

1. Opening webchat with 2+ split panes on different sessions
2. Sending messages to all of them simultaneously
3. Simulating a reconnect (network toggle or gateway restart)
4. Verifying streams resume without page refresh
5. Verifying no "event gap" errors appear in the UI

## Constraints

- This is the OpenClaw open-source repo, so changes should be clean and well-structured
- Don't break the existing protocol — `chat.status` extension should be backward-compatible
- The UI changes should gracefully handle older gateways that don't return `streamText`
