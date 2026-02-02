# SPEC: Coding Session Tool Cards (Inline Click-to-Open)

## Goal

When the agent starts a coding session via `exec` (running `claude`, `codex`, etc.), the tool card in the chat should be clickable — clicking it opens the Code Sessions panel focused on that specific session. Same UX pattern as file tool cards opening the artifact panel.

## Current State

- **Artifact pattern:** `exec` tool cards with `read`/`write`/`edit` show inline chips. Clicking a file tool chip calls `onOpenFilePreview(filePath)` → opens/focuses the artifact panel tab for that file.
- **Code Sessions panel:** Exists as a side panel (`codingPanelOpen`), toggled via a button in the header. Sessions are fetched from `/api/coding-sessions` and stored in `state.codingSessions`.
- **Registration:** Sessions must be POSTed to `/api/coding-sessions/:id` to appear. Currently manual — the agent or script must explicitly register.

## Changes

### 1. Auto-detect coding sessions from exec tool calls

In `coding-sessions-http.ts` (or a new server-side middleware), auto-register a coding session when an exec tool call matches known coding agent commands:

**Detection patterns** (match against the `command` arg of `exec` tool calls):
- `claude` (with any flags)
- `codex` (with any flags)
- `cc` / `kimi` (shell aliases)

This should happen server-side when the exec tool is invoked, so sessions appear immediately.

**In `src/agents/bash-tools.ts` or the exec handler:**
- After spawning the process, if the command matches a coding agent pattern:
  - Auto-register with `/api/coding-sessions/:id` (or directly write to the state file)
  - Store: `{ id, name: <from command>, status: "running", tool: "claude-code"|"codex", execSessionId: <exec registry id>, tmuxSession: <if tmux>, startedAt, workDir, command }`

### 2. Clickable exec tool cards for coding sessions

In `ui/src/ui/chat/tool-cards.ts`:

- Add a new callback: `onOpenCodingSession?: (sessionId: string) => void`
- In `renderToolCardSidebar()`, detect exec tool calls where the command matches a coding agent pattern
- When detected, render the chip with a special icon (e.g., `code` icon) and make it clickable
- Clicking calls `onOpenCodingSession(sessionId)` which:
  1. Opens the coding panel (`codingPanelOpen = true`)
  2. Expands that specific session (`codingExpanded` set to that session ID)

### 3. Wire the callback through the render chain

Following the `onOpenFilePreview` pattern:

- **`ChatProps`** in `views/chat.ts`: Add `onOpenCodingSession?: (sessionId: string) => void`
- **`grouped-render.ts`**: Thread `onOpenCodingSession` through render opts down to `renderToolCardSidebar`
- **`app.ts`**: Add `handleOpenCodingSession(sessionId: string)` method:
  ```ts
  handleOpenCodingSession(sessionId: string) {
    this.codingPanelOpen = true;
    this.codingExpanded.add(sessionId);
    // trigger a fetch if sessions aren't loaded
    if (this.codingSessions.length === 0) {
      void this.fetchCodingSessions();
    }
  }
  ```
- **`app-render.ts`**: Pass `onOpenCodingSession` in `buildChatProps()` or equivalent, wired to `state.handleOpenCodingSession`

### 4. Match exec tool calls to coding sessions

The exec tool's `command` arg is visible in the tool card. To link a tool card to a coding session:

- Extract the exec session ID from the tool result (if available) or match by command pattern
- The server-side auto-registration (step 1) should include the exec session ID
- The tool card renderer matches by checking if any `state.codingSessions` has a matching `execSessionId` or command

**Simpler approach:** Just detect the command pattern client-side in the tool card renderer. If the exec command matches `claude|codex|cc|kimi`, make it clickable and open the coding panel. The panel will show all sessions — clicking focuses the right one by matching the command/timing.

### 5. Tool display config

In `tool-display.json`, add an `exec` entry or enhance the existing one:
```json
{
  "exec": {
    "icon": "wrench",
    "title": "Exec",
    "detailKeys": ["command"],
    "variants": {
      "codingSession": {
        "icon": "code",
        "title": "Code Session",
        "match": { "command": "^(claude|codex|cc|kimi)\\b" }
      }
    }
  }
}
```

## Files to Modify

1. **`src/agents/bash-tools.ts`** (or exec handler) — Auto-register coding sessions on spawn
2. **`ui/src/ui/chat/tool-cards.ts`** — Add `onOpenCodingSession` callback, detect coding exec commands
3. **`ui/src/ui/chat/grouped-render.ts`** — Thread `onOpenCodingSession` through render chain
4. **`ui/src/ui/views/chat.ts`** — Add `onOpenCodingSession` to `ChatProps`
5. **`ui/src/ui/app.ts`** — Add `handleOpenCodingSession()` method
6. **`ui/src/ui/app-render.ts`** — Wire callback in chat props
7. **`ui/src/ui/tool-display.json`** — Add exec/coding session variant (optional)

## UX

- Exec tool chips for coding agents show a `code` icon instead of `wrench`
- Hovering shows "Open in Code Sessions"
- Clicking opens the Code Sessions panel and expands/scrolls to that session
- If the panel is already open, just focuses the session
- Non-coding exec calls remain unchanged (regular wrench icon, click opens sidebar with output)
