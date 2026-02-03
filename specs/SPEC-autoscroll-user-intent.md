# SPEC: Respect User Scroll Intent During Streaming

## Problem

When messages stream in, the webchat autoscrolls to show new content. But if a user scrolls up to read earlier content, the autoscroll fights them and pulls them back down. This is frustrating UX.

## Current Behavior

In `ui/src/ui/app-scroll.ts`:

- `scheduleChatScroll()` checks `shouldStick = force || host.chatUserNearBottom || distanceFromBottom < 200`
- After scrolling, it sets `host.chatUserNearBottom = true`
- `handleChatScroll()` sets `chatUserNearBottom` based on distance from bottom

The issue: autoscroll sets `chatUserNearBottom = true` after every scroll, so user intent gets lost.

## Desired Behavior

1. **Autoscroll normally** when user is at/near bottom (passive - not actively scrolling)
2. **Pause autoscroll** when user scrolls UP (counter-scroll intent detected)
3. **Resume autoscroll** only when user manually scrolls back to the bottom
4. **Show "scroll to bottom" indicator** when autoscroll is paused and new content exists (optional enhancement)

## Implementation

### 1. Add `chatUserScrolledAway` flag to ScrollHost

```ts
type ScrollHost = {
  // ... existing fields
  chatUserScrolledAway: boolean; // true when user intentionally scrolled up
};
```

### 2. Detect counter-scroll intent

In `handleChatScroll()`, detect when user scrolls away from bottom:

```ts
export function handleChatScroll(host: ScrollHost, event: Event) {
  const container = event.currentTarget as HTMLElement | null;
  if (!container) return;
  const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;

  const wasNearBottom = host.chatUserNearBottom;
  host.chatUserNearBottom = distanceFromBottom < 200;

  // User scrolled away from bottom → pause autoscroll
  if (wasNearBottom && !host.chatUserNearBottom) {
    host.chatUserScrolledAway = true;
  }

  // User scrolled back to bottom → resume autoscroll
  if (host.chatUserNearBottom && host.chatUserScrolledAway) {
    host.chatUserScrolledAway = false;
  }
}
```

### 3. Update `scheduleChatScroll()` to respect user intent

```ts
// In shouldStick calculation:
const shouldStick =
  force || (!host.chatUserScrolledAway && (host.chatUserNearBottom || distanceFromBottom < 200));

// Remove the unconditional `host.chatUserNearBottom = true` after scrolling
// Only set it if we actually scrolled AND user hasn't scrolled away
if (!host.chatUserScrolledAway) {
  host.chatUserNearBottom = true;
}
```

### 4. Reset flag on thread change

In `resetChatScroll()`:

```ts
export function resetChatScroll(host: ScrollHost) {
  host.chatHasAutoScrolled = false;
  host.chatUserNearBottom = true;
  host.chatUserScrolledAway = false; // Reset on thread switch
}
```

### 5. Initialize the flag

Wherever `ScrollHost` is initialized (likely in `app.ts` or similar), add:

```ts
chatUserScrolledAway: false,
```

## Files to Modify

1. `ui/src/ui/app-scroll.ts` - Main logic changes
2. `ui/src/ui/app.ts` (or wherever ScrollHost is instantiated) - Add new field initialization
3. `ui/src/ui/app-scroll.test.ts` - Update tests

## Testing

1. Start a long streaming response
2. Scroll up while streaming - autoscroll should stop
3. New content should keep appearing but not pull you down
4. Scroll back to bottom - autoscroll should resume
5. Thread switch should reset and autoscroll from bottom

## Optional Enhancement

Add a "↓ New messages" floating button when `chatUserScrolledAway && hasNewContent`. Clicking it scrolls to bottom and clears the flag. This is a UX nicety but not required for the core fix.
