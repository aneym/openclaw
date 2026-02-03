# SPEC: Chat Queue UI Revamp

## Overview

Revamp the webchat message queue to bring it up to the standard of the rest of the UI — better theming, proper icons, and key functionality gaps filled.

## Current State

The queue works functionally (enqueue, flush, persist, send-now, remove) but the UI is bare-bones — dashed borders, tiny text, no interactivity beyond remove/send-now. It feels like a debug panel, not a polished feature.

## Changes

### 1. Theming & Visual Polish

The queue UI should match the rest of the chat UI's look and feel.

**Current (problems):**
- Dashed border looks provisional/debug
- `11px` title font is too small
- No visual hierarchy between queue title bar and items
- Send-now (⚡) and remove (✕) buttons are tiny, hard to hit
- No hover states on items
- No transition/animation when items are added or removed

**Target:**
- Solid subtle border (1px solid var(--border)) with rounded corners matching chat bubbles
- Queue header: slightly larger font (12px), includes count badge and "Clear All" action
- Items: background `var(--surface)`, subtle hover highlight, proper padding (8px 12px)
- Action buttons: proper icon buttons with hover backgrounds (like the compose action buttons)
- Smooth CSS transitions on item add/remove if feasible with lit-html

### 2. Queue Header with Clear All

Replace the plain "Queued (N)" text with a proper header bar:

```html
<div class="chat-queue__header">
  <span class="chat-queue__count">
    <icon:list-ordered /> Queued · {N}
  </span>
  <button class="chat-queue__clear-all" title="Clear all queued messages">
    Clear
  </button>
</div>
```

- Add `onQueueClearAll` to `ChatProps`
- Implement `clearAllQueuedMessages(host)` in `app-chat.ts` — clears `chatQueue` array + `saveQueue`
- Wire through `chat-pane.ts` → `app.ts`

### 3. Queue Item Improvements

Each queue item should show:
- **Message text** (current, but with better truncation — show 3 lines, expandable on click)
- **Attachment indicator** — show thumbnail or icon if attachments exist (not just "Image (N)")
- **Timestamp** — relative time since queued ("just now", "2m ago")
- **Action buttons** — properly sized with icon + tooltip:
  - ▶ **Send Now** — abort current run + send this message (existing ⚡, but use `play` or `send` icon instead of zap for consistency)
  - ✕ **Remove** — remove from queue (existing)

### 4. Icon Consistency

Current icons don't match the rest of the UI:
- **⚡ (zap)** for "Send Now" is misleading — it implies urgency/danger, not "send"
- Use `arrowUp` (same as the send button) or a `play` icon for Send Now instead
- The compose area's "Send Now" button when busy should also use the same icon treatment

Replace:
- Queue item send-now: `icons.zap` → `icons.arrowUp` (matches the send button, users already know what ↑ means)
- Compose send-now: `icons.zap` → `icons.arrowUp` with a different color/style to distinguish from regular send
- Add a subtle label or different bg color to distinguish "Queue" from "Send Now" in compose

### 5. Compose Area When Busy

Current: `[⏹ Stop] [↑ Queue (primary)] [⚡ Send Now]`

Better:
- **Stop** button stays as-is
- **Send** button (primary) → when busy, becomes "Queue" with a `queue`/`list-plus` icon to indicate queuing, not immediate send
- **Send Now** button → secondary/warning style, uses `↑` (arrowUp) icon, tooltip says "Stop current run and send now"
- **Keyboard shortcut**: `Enter` = queue (when busy), `Cmd+Shift+Enter` = send now

### 6. Keyboard Shortcut: Cmd+Shift+Enter for Send Now

In `ui/src/ui/views/chat.ts`, the textarea `@keydown` handler:
- `Enter` (no modifier) = send/queue (existing)
- `Shift+Enter` = newline (existing)  
- `Cmd+Shift+Enter` (or `Ctrl+Shift+Enter` on non-Mac) = send immediately when busy

### 7. Abort + Send Now: Preserve Context

When "Send Now" aborts the current run:
1. Call `abortChatRun`
2. **Reload chat history** before sending the new message — this ensures the partial response from the aborted run is visible in the thread
3. Then send the new message

Add a `loadChatHistory` call in `sendChatImmediately` between the abort completion and the new send:
```ts
async function sendChatImmediately(host, message, attachments?) {
  await abortChatRun(host);
  const cleared = await waitForAbortComplete(host);
  if (!cleared) {
    enqueueChatMessage(host, message, attachments);
    return;
  }
  // Reload history so the aborted partial response is visible
  await loadChatHistory(host);
  await sendChatMessageNow(host, message, { attachments });
}
```

### 8. CSS File Organization

Move queue styles from `components.css` into `chat/layout.css` (where the rest of the chat compose styles live) or a new `chat/queue.css` if it gets big enough. The queue is part of the chat layout, not a generic component.

## Files to Modify

- `ui/src/ui/views/chat.ts` — queue rendering, compose buttons, keyboard shortcut
- `ui/src/ui/views/chat-pane.ts` — wire new props
- `ui/src/ui/app-chat.ts` — `clearAllQueuedMessages`, fix `sendChatImmediately` to reload history, update `handleSendChat`
- `ui/src/ui/app.ts` — expose new handlers
- `ui/src/ui/app-view-state.ts` — type updates
- `ui/src/ui/app-render.ts` — wire props in single-pane mode
- `ui/src/styles/components.css` — remove old queue styles
- `ui/src/styles/chat/layout.css` — add revamped queue styles
- `ui/src/ui/keyboard-shortcuts.ts` — possibly, if shortcut registration is centralized there
- `ui/src/ui/icons.ts` — add any missing icons (list-ordered, or reuse existing)

## Non-Goals

- Drag-to-reorder (nice-to-have, not in this pass)
- Inline editing of queued messages
- Queue max size / overflow behavior

## Testing

- `pnpm build` must pass clean
- Existing tests in chat.test.ts must still pass (update new required props)
- Manual: verify queue renders correctly, clear all works, send now works, keyboard shortcut works, aborted partial response is visible after send-now
