# SPEC: Response Completion Sound

## Goal

Play a subtle notification sound when the assistant finishes responding. This helps users who tab away know when responses are ready.

## Behavior

1. **Setting**: Add `notificationSound: boolean` to `UiSettings` (default: `false` — opt-in)
2. **Trigger**: Play sound when a chat run completes successfully (`state === "final"`)
3. **Skip if**:
   - Tab is focused AND chat pane is visible (no need to alert if user is watching)
   - Response was aborted or errored (only play on successful completion)
4. **Sound**: Use a subtle, pleasant sound. Web Audio API or `<audio>` element with a small MP3/WAV.

## Implementation

### 1. Add setting to `storage.ts`

```ts
export type UiSettings = {
  // ... existing fields
  notificationSound: boolean; // Play sound when response completes
};
```

Add to defaults (`false`) and parsing logic.

### 2. Add sound file

Place a small audio file at `ui/public/sounds/notification.mp3` (or .wav).

- Keep it subtle (soft chime, ~0.5-1s duration)
- Can use a royalty-free sound or generate one

### 3. Create audio utility `ui/src/ui/notification-sound.ts`

```ts
let audio: HTMLAudioElement | null = null;

export function playNotificationSound() {
  if (!audio) {
    audio = new Audio("/sounds/notification.mp3");
    audio.volume = 0.3; // Subtle
  }
  audio.currentTime = 0;
  audio.play().catch(() => {
    // Autoplay blocked — ignore
  });
}

export function shouldPlaySound(tabFocused: boolean, chatVisible: boolean): boolean {
  // Only play if user isn't actively watching
  return !(tabFocused && chatVisible);
}
```

### 4. Hook into `app-gateway.ts`

In `handleGatewayEventUnsafe`, after detecting `state === "final"`:

```ts
if (state === "final") {
  // Play notification sound if enabled and user isn't watching
  if (host.settings.notificationSound) {
    const tabFocused = document.hasFocus();
    const chatVisible = host.tab === "chat";
    if (shouldPlaySound(tabFocused, chatVisible)) {
      playNotificationSound();
    }
  }
  // ... existing history load logic
}
```

### 5. Add UI toggle

In the settings/preferences UI (likely in the chat settings popover or a dedicated settings view):

```html
<label>
  <input type="checkbox" checked="{settings.notificationSound}" onChange="{...}" />
  Play sound when response completes
</label>
```

Look at existing settings toggles (like `chatShowThinking`) for the pattern.

## Files to modify

1. `ui/src/ui/storage.ts` — Add setting
2. `ui/src/ui/notification-sound.ts` — New file, audio utility
3. `ui/src/ui/app-gateway.ts` — Hook sound trigger on final state
4. `ui/public/sounds/notification.mp3` — Add sound file
5. Settings UI component (find existing settings toggle pattern)

## Notes

- Use `audio.play().catch()` to handle autoplay policy gracefully
- Consider adding volume control later if users want it
- The sound should be SHORT and subtle — not annoying
- For the sound file, can use a simple sine wave beep or find a royalty-free chime
