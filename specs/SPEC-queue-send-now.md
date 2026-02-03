# SPEC: Webchat Queue — Send Immediately Option

> Recovered from session transcript (original SPEC.md was never committed, written by Bot then overwritten during upstream merge)

## Overview
Extend the webchat message queue to support two modes when the agent is busy:
1. **Queue** (existing) — message waits in queue, sent after current run finishes
2. **Send Immediately** — abort the current run, send the message now, keep message history

Also add a "Send Now" button to each queued message in the queue UI.

## Current Architecture

### Client-side queue (`ui/src/ui/app-chat.ts`)
- `handleSendChat()` checks `isChatBusy()` → if busy, calls `enqueueChatMessage()`
- `enqueueChatMessage()` pushes to `host.chatQueue[]` (persisted via `saveQueue`)
- `flushChatQueue()` runs after a run finishes, sends next queued message
- `isChatBusy()` = `host.chatSending || Boolean(host.chatRunId)`

### Abort mechanism (`ui/src/ui/controllers/chat.ts`)
- `abortChatRun()` sends `chat.abort` to gateway
- Gateway emits `chat` event with `state: "aborted"`
- Client clears `chatRunId`, `chatStream`, `chatStreamStartedAt`

### Queue UI (`ui/src/ui/views/chat.ts`)
- Rendered between the chat thread and compose area
- Shows "Queued (N)" title, each item shows text + X (remove) button
- ChatProps has: `queue: ChatQueueItem[]`, `onQueueRemove: (id: string) => void`

### Types (`ui/src/ui/ui-types.ts`)
```ts
type ChatQueueItem = {
  id: string;
  text: string;
  createdAt: number;
  attachments?: ChatAttachment[];
  refreshSessions?: boolean;
};
```

## Changes Required

### 1. New prop + handler: `onQueueSendNow`
**File: `ui/src/ui/views/chat.ts`**
- Add to `ChatProps`: `onQueueSendNow: (id: string) => void`
- In the queue item rendering, add a "Send Now" button (⚡ or ▶ icon) next to the X button
- The "Send Now" button should: abort current run → remove from queue → send that message

### 2. New "Send Immediately" compose action
**File: `ui/src/ui/views/chat.ts`**
- When `isBusy` is true, show TWO buttons in the compose area:
  - Primary: "Queue" button (current behavior — queue the message)
  - Secondary: "Send Now" button (abort + send immediately)
- Keep the stop button as-is

### 3. Implement `sendChatImmediately` in app-chat.ts
**File: `ui/src/ui/app-chat.ts`**
- New function `sendChatImmediately(host, message, attachments?)`:
  1. Call `abortChatRun(host)` 
  2. Wait for the abort to complete (listen for chatRunId to become null, or poll with short timeout)
  3. Call `sendChatMessageNow(host, message, { attachments })`
- New function `sendQueuedMessageNow(host, id)`:
  1. Find the queued item by id
  2. Remove it from queue
  3. Call `sendChatImmediately(host, item.text, item.attachments)`

### 4. Wire up in `handleSendChat`
**File: `ui/src/ui/app-chat.ts`**
- Add a `sendImmediately` option to `handleSendChat`:
  ```ts
  export async function handleSendChat(host, messageOverride?, opts?: { restoreDraft?: boolean; sendImmediately?: boolean })
  ```
- When `isChatBusy(host)` and `opts.sendImmediately`:
  - Don't enqueue — instead call `sendChatImmediately`

### 5. Wire up in chat-pane.ts
**File: `ui/src/ui/views/chat-pane.ts`**
- Pass `onQueueSendNow` callback through to `renderChat`

### 6. Wire up in app.ts / app-view-state
- Expose `handleSendChatImmediately()` and `handleQueueSendNow(id)` on the app state
- Both call into the new `app-chat.ts` functions

## UI Design

### Compose area (when busy):
```
[textarea                        ] [⏹ Stop] [📤 Queue] [⚡ Send Now]
```
- Stop button: existing, aborts without sending
- Queue button: existing behavior (primary color)
- Send Now button: new, different color (e.g. warning/accent), aborts and sends

### Queue UI (existing queue items):
```
Queued (2)
┌─────────────────────────────────────────┐
│ "Can you also check the weather?"  [▶] [✕] │
│ "And remind me about dinner"       [▶] [✕] │
└─────────────────────────────────────────┘
```
- ▶ (or ⚡) button: sends that specific queued message immediately (aborts current run first)
- ✕ button: existing remove behavior

## Abort + Send Flow

The tricky part is waiting for the abort to actually complete before sending. The approach:

1. Call `abortChatRun(host)` — this sends `chat.abort` to gateway
2. The gateway will emit a `chat` event with `state: "aborted"` 
3. `handleChatEvent` will set `chatRunId = null`
4. We need to wait for `chatRunId` to become null before sending

Implementation: Use a polling approach with `requestAnimationFrame` or a short `setInterval`:
```ts
async function waitForAbortComplete(host: ChatHost, timeoutMs = 5000): Promise<boolean> {
  if (!host.chatRunId) return true;
  const start = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      if (!host.chatRunId) { resolve(true); return; }
      if (Date.now() - start > timeoutMs) { resolve(false); return; }
      setTimeout(check, 50);
    };
    check();
  });
}
```

## Important Notes
- Message history is preserved — abort only stops the current generation, doesn't clear history
- The aborted partial response stays in history (this is existing behavior)
- Queue order: "Send Now" on a queued message should send THAT message next, not drain the queue
- After "Send Now" completes, remaining queue items stay queued and drain normally after
- Split pane mode: needs to work for both focused and non-focused panes (via chat-pane.ts)
