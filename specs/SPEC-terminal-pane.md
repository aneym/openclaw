# SPEC: Terminal Emulator Pane

## Goal

Add a **terminal pane type** to the OpenClaw web UI. Panes can currently only show chat sessions. After this change, a pane can also be a full terminal emulator (xterm.js) connected to a real PTY on the server via WebSocket.

User opens a terminal from the pane context menu or thread list → gets a shell. They can type `claude`, `codex`, `vim`, whatever.

## Architecture

```
┌─────────────────────────────────────────────┐
│  Web UI (browser)                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Chat Pane│  │Term Pane │  │ Chat Pane│  │
│  │ (existing│  │ xterm.js │  │ (existing│  │
│  │  Lit)    │  │  ↕ WS    │  │  Lit)    │  │
│  └──────────┘  └──────────┘  └──────────┘  │
└─────────────────┬───────────────────────────┘
                  │ WebSocket /ws/terminal?id=xxx
┌─────────────────▼───────────────────────────┐
│  Gateway (Node.js server)                   │
│  ┌──────────────────────┐                   │
│  │ terminal-pty.ts      │                   │
│  │ - spawn @lydell/     │                   │
│  │   node-pty           │                   │
│  │ - Map<id, PtyHandle> │                   │
│  │ - resize support     │                   │
│  └──────────────────────┘                   │
└─────────────────────────────────────────────┘
```

## Stack

- **Client:** `xterm.js` + `@xterm/addon-fit` + `@xterm/addon-web-links` (npm packages, add to `ui/package.json`)
- **Server:** `@lydell/node-pty` (already a dependency!) + `ws` (already used)
- **Transport:** WebSocket, binary frames for data, JSON text frames for control (resize)

## Changes

### 1. Server: `src/gateway/terminal-pty.ts` (new file)

PTY session manager:

```typescript
interface TerminalSession {
  id: string;
  pty: PtyHandle;
  ws: WebSocket | null;
  createdAt: number;
  cwd: string;
}

// Map of active terminal sessions
const sessions = new Map<string, TerminalSession>();

// API:
// - createTerminalSession(cwd?: string): { id: string }
// - attachWebSocket(id: string, ws: WebSocket): void
// - resizeTerminal(id: string, cols: number, rows: number): void
// - killTerminal(id: string): void
// - listTerminals(): TerminalSession[]
```

Spawn with `@lydell/node-pty`:
- Shell: user's login shell (use `getShellPathFromLoginShell()` from existing `shell-env.ts`)
- Default cwd: gateway workspace dir
- Env: inherit `process.env` (same as existing exec tool)
- Default size: 80x24, resized on attach

PTY data → WS binary frame. WS text frame → parse as JSON control message. WS binary frame → PTY stdin.

Control messages (JSON over text frames):
```json
{ "type": "resize", "cols": 80, "rows": 24 }
{ "type": "ping" }
```

On WS close: keep PTY alive (allow reconnect). On PTY exit: send `{ "type": "exit", "code": 0 }` and close WS.

Idle cleanup: kill PTY sessions with no WS attached for >30 minutes.

### 2. Server: WebSocket route in `server-http.ts`

In `attachGatewayUpgradeHandler`, intercept upgrade requests to `/ws/terminal`:

```typescript
httpServer.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url!, `http://localhost`);

  if (url.pathname === "/ws/terminal") {
    // Auth check (same as main WS — check password/token from query or header)
    const terminalId = url.searchParams.get("id");
    // If id provided: attach to existing session
    // If no id: create new session, attach
    terminalWss.handleUpgrade(req, socket, head, (ws) => {
      // ... attach ws to terminal session
    });
    return;
  }

  if (canvasHost?.handleUpgrade(req, socket, head)) return;
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});
```

This requires a **second WebSocketServer** instance for the terminal path (or use the `noServer` option and manually handle upgrade routing).

### 3. Server: HTTP endpoints for terminal management

Add to `server-http.ts` routing (or new `terminal-http.ts`):

```
POST /api/terminals          → create new terminal session, returns { id }
GET  /api/terminals          → list active terminals [{ id, cwd, createdAt, connected }]
POST /api/terminals/:id/kill → kill terminal
```

These are called by the UI before opening the WebSocket.

### 4. Client: `ui/src/ui/views/terminal-pane.ts` (new file)

Lit component that:
1. Creates an xterm.js `Terminal` instance
2. Loads `FitAddon` and `WebLinksAddon`
3. Connects to `ws://<gateway>/ws/terminal?id=<terminalId>`
4. Pipes WS binary data → `terminal.write()`
5. Pipes `terminal.onData()` → WS binary send
6. On resize (ResizeObserver on container div): `fitAddon.fit()` → send resize control message
7. Handles `{ type: "exit" }` → show "Process exited" overlay with reconnect/close buttons
8. Theming: match xterm colors to OpenClaw dark/light theme

Exports `renderTerminalPane(props: TerminalPaneProps)` similar to `renderChatPane()`.

### 5. Client: Split tree changes — `split-tree.ts`

Add optional `paneType` to `SplitLeaf`:

```typescript
export type PaneType = "chat" | "terminal";

export interface SplitLeaf {
  kind: "leaf";
  id: string;
  threadId: string;       // for chat: session key. for terminal: terminal session id
  paneType?: PaneType;    // default: "chat" (backward compat)
}
```

Update serialization to include `paneType`:
```typescript
type SerializedLeaf = { k: "l"; id: string; t: string; pt?: "t" };  // pt:"t" = terminal
```

Add helper:
```typescript
export function createTerminalLeaf(terminalId: string, id?: string): SplitLeaf {
  return { kind: "leaf", id: id ?? generatePaneId(), threadId: terminalId, paneType: "terminal" };
}
```

### 6. Client: Split pane container — `split-pane-container.ts`

Update `renderLeaf()` to check `paneType`:

```typescript
function renderLeaf(leaf: SplitLeaf, state: AppViewState) {
  if (leaf.paneType === "terminal") {
    return renderTerminalPane({ leaf, state, isFocused: state.focusedPaneId === leaf.id });
  }
  // existing chat pane render
  return renderChatPane({ leaf, state, paneState, isFocused });
}
```

### 7. Client: App state — `app.ts` / `app-view-state.ts`

Add to `AppViewState`:
```typescript
// Terminal pane support
openTerminalPane: (cwd?: string) => void;         // create terminal + open in new pane
openTerminalInSplit: (direction: "horizontal" | "vertical", cwd?: string) => void;
closeTerminalPane: (paneId: string) => void;
terminalSessions: Map<string, { id: string; cwd: string; createdAt: number; connected: boolean }>;
```

In `app.ts`:
- `openTerminalPane()`: POST `/api/terminals` → get id → create terminal leaf → add to split tree
- Track terminal WebSocket connections for status display

### 8. Client: Pane context menu — `pane-context-menu.ts`

Add "Open Terminal" option to the pane context menu (right-click on a pane):
- "Open Terminal Here" → replace current pane with terminal
- "Split Terminal Right" → split horizontal, new terminal pane
- "Split Terminal Below" → split vertical, new terminal pane

### 9. Client: Thread list / sidebar

Add a "Terminal" button in the thread list header (next to the existing "+" new thread button):
- Click → opens a new terminal pane (or splits if panes exist)
- Small terminal icon (🖥️ or use an SVG terminal icon)

### 10. Styles

Add xterm.js CSS. The `xterm.js` package includes `xterm.css` — import it in the build.

Terminal pane styles:
- Full-height container, no padding (xterm manages its own viewport)
- Thin header bar: shows cwd, connected status, close button
- On process exit: semi-transparent overlay with exit code + "Restart" / "Close" buttons

Theme integration:
```typescript
const DARK_THEME = {
  background: '#1a1a2e',  // match OpenClaw dark bg
  foreground: '#e0e0e0',
  cursor: '#f0f0f0',
  // ... standard 16 ANSI colors
};
const LIGHT_THEME = { ... };
```

## npm packages to add (ui/package.json)

```json
{
  "@xterm/xterm": "^5.5.0",
  "@xterm/addon-fit": "^0.10.0",
  "@xterm/addon-web-links": "^0.11.0"
}
```

## Auth

Terminal WebSocket must be authenticated. Reuse the same auth mechanism as the main gateway WS:
- Password/token from query param or header
- Check in the upgrade handler before accepting

## Edge Cases

- **Browser refresh:** Terminal sessions persist server-side. On reconnect, re-attach to existing PTY (output since disconnect is lost, but the session is alive).
- **Multiple tabs:** Each browser tab can attach to a different terminal, or the same terminal (last one wins for input).
- **Gateway restart:** All PTY sessions die. UI shows "disconnected" state, user can create new terminal.
- **Resize race:** Debounce fit addon resize events (100ms) before sending to server.

## Out of Scope (for now)

- Terminal session persistence across gateway restarts (would need tmux integration)
- Terminal tabs within a single pane (one terminal per pane is fine)
- Scrollback limit configuration (use xterm.js default: 1000 lines)
- Copy/paste (xterm.js handles this natively)
- Search within terminal output (future: `@xterm/addon-search`)

## File Summary

| File | Action |
|------|--------|
| `src/gateway/terminal-pty.ts` | **NEW** — PTY session manager |
| `src/gateway/terminal-http.ts` | **NEW** — REST endpoints for terminal CRUD |
| `src/gateway/server-http.ts` | **EDIT** — add terminal WS upgrade route + HTTP routing |
| `ui/package.json` | **EDIT** — add xterm.js deps |
| `ui/src/ui/views/terminal-pane.ts` | **NEW** — xterm.js Lit component |
| `ui/src/ui/split-tree.ts` | **EDIT** — add `paneType` to SplitLeaf + serialization |
| `ui/src/ui/views/split-pane-container.ts` | **EDIT** — route terminal leaves to terminal renderer |
| `ui/src/ui/app-view-state.ts` | **EDIT** — add terminal state/handlers |
| `ui/src/ui/app.ts` | **EDIT** — implement terminal handlers |
| `ui/src/ui/components/pane-context-menu.ts` | **EDIT** — add terminal options |
| `ui/src/ui/views/thread-list.ts` | **EDIT** — add terminal button |
| `ui/src/styles.css` | **EDIT** — import xterm.css, terminal pane styles |

## Execution Rules

1. Before starting each phase, re-read this SPEC to refresh your goals.
2. Maintain a `progress.md` in the project root:
   - After each phase: what you did, files changed, decisions made
   - Any errors hit and how you resolved them
   - What's next
3. If an approach fails twice, try a different method — don't repeat the same fix.
4. After every 2 research/exploration actions, write findings to progress.md before continuing.
5. Commit after completing the server side, then commit after client side, then a final commit after integration testing.
6. Run `npm run build` after changes to verify nothing breaks.
7. Start with the server side (terminal-pty.ts + routes), then client side (xterm pane), then integrate into the split tree system.
