# SPEC: Unread Notifications & Triage Inbox

## Overview

Detects when agent runs complete while the user isn't viewing that chat, surfaces visual indicators (sidebar dot, tab dot, dock badge), plays notification sounds, and provides a triage inbox for focused review of unread completions.

## Architecture

### What triggers "unread"

An agent run completes (`final`, `error`, or `aborted` state) for a chat the user **isn't currently viewing**. A chat is "being viewed" when ALL of:

1. The Electron window has focus (`document.hasFocus()`)
2. A panel containing that chatId is the **focused** panel (via `focusedPanelIds`)
3. The tab containing that chatId is the **active** tab in that panel

### Where state lives

| Store                  | Key                   | Purpose                                            |
| ---------------------- | --------------------- | -------------------------------------------------- |
| `useChatStore`         | `hasUnread` on `Chat` | Per-chat unread boolean, persisted in localStorage |
| `useNotificationStore` | `kos-notifications`   | Sound/badge preferences, persisted in localStorage |

### Event flow

```
Gateway "chat" event (final/error/aborted)
  → use-session-sync.ts handler
  → isChatVisible(chatId, workspaceId)?
  → If NOT visible:
      markUnread(chatId)
      playNotificationSound()
      setDockBadge(getUnreadCount())
  → If visible: no-op

Panel focus / tab switch / window focus
  → use-mark-read.ts (debounced 300ms)
  → getVisibleChatId(workspaceId)
  → If chat hasUnread: markRead(chatId), update dock badge
```

## Files

### Core Infrastructure

| File                           | Purpose                                            |
| ------------------------------ | -------------------------------------------------- |
| `types/chat.ts`                | `hasUnread?: boolean` on Chat interface            |
| `stores/chat-store.ts`         | `markUnread`, `markRead`, `getUnreadCount` actions |
| `lib/unread.ts`                | `isChatVisible()` + `getVisibleChatId()` utilities |
| `hooks/use-mark-read.ts`       | Auto-clear unread on focus (debounced)             |
| `stores/notification-store.ts` | Sound/badge preferences                            |
| `lib/notification-sounds.ts`   | Web Audio API synth sounds (chime, pop, ping)      |

### Visual Indicators

| File                                | Change                                  |
| ----------------------------------- | --------------------------------------- |
| `components/layout/ChatItem.tsx`    | Unread dot (h-2 w-2 bg-primary)         |
| `components/panels/PanelTabBar.tsx` | Tab unread dot (h-1.5 w-1.5 bg-primary) |
| `components/layout/Sidebar.tsx`     | Triage button with unread count badge   |

### Triage Inbox

| File                                | Purpose                                                 |
| ----------------------------------- | ------------------------------------------------------- |
| `components/triage/TriageInbox.tsx` | Card list with keyboard nav (j/k/Enter/Space)           |
| `components/triage/TriageCard.tsx`  | Memo'd card — channel icon, title, preview, timestamp   |
| `components/layout/Shell.tsx`       | Mounts hooks, renders triage view, Cmd+Shift+I shortcut |

### Main Process / IPC

| File                 | Change                           |
| -------------------- | -------------------------------- |
| `main/index.ts`      | `app:set-dock-badge` IPC handler |
| `preload/index.ts`   | `setDockBadge` bridge method     |
| `preload/index.d.ts` | Type declaration                 |

### Settings

| File                                           | Purpose                                                    |
| ---------------------------------------------- | ---------------------------------------------------------- |
| `components/settings/NotificationSettings.tsx` | Sound toggle, selector, preview, volume, dock badge toggle |
| `components/settings/Settings.tsx`             | Added Notifications section                                |

## Notification Sounds

Uses Web Audio API (`OscillatorNode`) — no bundled audio files:

| Sound | Frequency | Waveform | Duration |
| ----- | --------- | -------- | -------- |
| Chime | 880 Hz    | sine     | 150ms    |
| Pop   | 440 Hz    | triangle | 100ms    |
| Ping  | 1200 Hz   | sine     | 80ms     |

All sounds apply gain envelope for clean attack/release.

## Triage Inbox Keyboard Shortcuts

| Key                   | Action              |
| --------------------- | ------------------- |
| `j` / `ArrowDown`     | Next card           |
| `k` / `ArrowUp`       | Previous card       |
| `Enter`               | Open chat           |
| `Space` / `Backspace` | Dismiss (mark read) |

Global shortcut: `Cmd+Shift+I` toggles triage view.

## Future: Terminal Awareness

Terminal panels currently have no knowledge of Claude Code execution state. Future work:

- Parse terminal output for Claude Code markers (prompt indicators, completion signals)
- Track per-terminal "agent running" / "agent idle" state
- Apply same unread/triage pattern to terminal completions
- Requires either: (a) PTY output parsing heuristics, or (b) Claude Code emitting structured status events
