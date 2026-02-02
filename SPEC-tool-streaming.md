# SPEC: Always-On Tool Activity Streaming

## Problem

When the webchat UI is streaming a response, tool execution produces no visual feedback unless "verbose" mode is enabled. After text streaming finishes and tool calls begin, the UI appears frozen — the streaming bubble sits with stale text and no indication of what's happening.

### Root Causes

1. **Server gating**: In `src/gateway/server-chat.ts`, `createAgentEventHandler` completely drops all `stream: "tool"` events when `shouldEmitToolEvents()` returns false (which checks verbose level). Tool events never reach the UI.

2. **UI gating**: In `ui/src/ui/views/chat.ts`, `buildChatItems()` only adds tool messages when `props.showThinking` is true. Even if events arrived, they wouldn't render.

## Solution

### 1. Server: Always broadcast lightweight tool events

**File: `src/gateway/server-chat.ts`**

In the `createAgentEventHandler` return function (~line 249), change the tool event gating:

**Current behavior:**
```ts
if (evt.stream === "tool" && !shouldEmitToolEvents(evt.runId, sessionKey)) {
  agentRunSeq.set(evt.runId, evt.seq);
  return; // ← All tool events silently dropped
}
```

**New behavior:**
- When verbose IS on: broadcast full tool events (unchanged)
- When verbose is OFF: still broadcast `start` and `result` phase events, but strip heavy payloads (`args`, `result`, `partialResult`). Skip `update` events entirely.

```ts
if (evt.stream === "tool" && !shouldEmitToolEvents(evt.runId, sessionKey)) {
  const phase = typeof evt.data?.phase === "string" ? evt.data.phase : "";
  // Always broadcast start/result for UI activity tracking (stripped of heavy data)
  if (phase === "start" || phase === "result") {
    const lightData: Record<string, unknown> = {
      phase,
      name: evt.data.name,
      toolCallId: evt.data.toolCallId,
    };
    if (phase === "result") {
      lightData.isError = evt.data.isError;
      lightData.meta = evt.data.meta;
    }
    const lightPayload = { ...evt, sessionKey, data: lightData };
    broadcast("agent", lightPayload);
  }
  // Skip update events (partial results) when not verbose
  agentRunSeq.set(evt.runId, evt.seq);
  return;
}
```

This ensures the UI always knows when tools start and finish, with tool names, without sending heavy output data.

### 2. UI: Always show tool activity during streaming

**File: `ui/src/ui/views/chat.ts`**

In `buildChatItems()` (~line 700), change the tool message rendering gate:

**Current:**
```ts
if (props.showThinking) {
  for (let i = 0; i < tools.length; i++) {
    items.push({
      kind: "message",
      key: messageKey(tools[i], i + history.length),
      message: tools[i],
    });
  }
}
```

**New:** Always show tool messages when there's an active run (stream is non-null), regardless of showThinking:
```ts
const showTools = props.showThinking || (props.stream !== null && tools.length > 0);
if (showTools) {
  for (let i = 0; i < tools.length; i++) {
    items.push({
      kind: "message",
      key: messageKey(tools[i], i + history.length),
      message: tools[i],
    });
  }
}
```

This means tool chips always appear during an active run. When the run finishes and `stream` becomes null, they disappear (unless showThinking is on).

### 3. UI: Render tool chips between streaming text and thinking dots

**File: `ui/src/ui/chat/grouped-render.ts`**

In `renderStreamingGroup()`, the tool messages from `buildChatItems` are already rendered as separate grouped items in the chat list — they appear as message groups BEFORE the streaming group. This should work naturally because tool messages are pushed into `items` before the stream item in `buildChatItems`.

However, the tool messages during streaming render as their own message groups (with avatar, footer, etc.) which may look disconnected. Consider rendering them more compactly during streaming — but this is a polish step, not blocking.

## Files to Change

1. `src/gateway/server-chat.ts` — Remove hard gating of tool events; broadcast lightweight versions always
2. `ui/src/ui/views/chat.ts` — Show tool messages during active runs regardless of showThinking

## Testing

1. Open webchat with verbose OFF
2. Send a message that triggers tool calls
3. Verify: tool name chips appear during execution
4. Verify: after run completes, tool chips disappear (unless verbose/showThinking is on)
5. Verify: with verbose ON, full tool output still works as before
6. Verify: split-pane mode still works correctly

## Non-Goals

- Changing the tool card chip rendering/design
- Streaming partial tool output in non-verbose mode
- Changing what happens after the run completes (history reload behavior)
