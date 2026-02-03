# SPEC: kOS Panel Engine + Thread System (Track 2)

> **Covers:** KOS-7 (UI Layout), thread system **Depends on:** Track 1 (scaffold + types) **Directory:** `kos/src/renderer/src/`

## Goal

Implement the adaptive panel system and thread management. Users can split the main content area into resizable panels, each rendering a different panel type (chat, code editor, terminal, etc.). Layouts persist per thread — switching threads restores the exact layout.

## Tabs + Dashboard

Implement a top tab bar (VS Code/Cursor style) and a pinned Home/Dashboard tab. Tabs scope threads and layouts so users can run multiple project sessions in parallel while keeping a single gateway connection.

### Tab Model

Tabs are in-app (not native). One project tab per project per workspace. Home is pinned and non-closable.

```
type TabType = 'home' | 'project'

interface Tab {
  id: string
  workspaceId: string
  type: TabType
  title: string
  icon?: string
  projectId?: string
  isPinned: boolean
  lastActiveAt: number
}
```

### Tab Store

```
interface TabState {
  tabsByWorkspace: Record<string, Tab[]>
  activeTabIdByWorkspace: Record<string, string>
  activeThreadIdByTab: Record<string, string | null>
  selectedProjectIdByTab: Record<string, string | null>

  openHomeTab(workspaceId: string): void
  openProjectTab(workspaceId: string, projectId: string): void
  closeTab(tabId: string): void
  setActiveTab(tabId: string): void
  setActiveThread(tabId: string, threadId: string | null): void
  setSelectedProject(tabId: string, projectId: string | null): void
}
```

Notes:

- Tabs persist across app restart.
- Switching workspace restores that workspace’s tab set and active tab.
- Project tabs are unique by `(workspaceId, projectId)`; if already open, focus it.

### Tab Components

```
src/renderer/src/components/tabs/
├── TabBar.tsx           # Top tab strip
├── TabItem.tsx          # Single tab (icon, title, close, status dot)
└── TabOverflow.tsx      # Optional overflow dropdown for many tabs
```

Behavior:

- `Home` tab is pinned, not closable.
- Project tab shows project icon + name.
- Streaming indicator on a tab when any thread in that tab is streaming.
- Close button on hover.

### Dashboard (Home Tab)

The Home tab is a global dashboard + routing chat.

Dashboard sections:

- Open project tabs (status + quick switch).
- Running sessions (CC/Codex) with phase + duration.
- Active worktrees/sims/webviews (thread-linked).
- Recent errors/alerts (gateway + run errors).

Controls:

- Abort/stop a running session.
- Jump to the owning tab/thread.

#### Data Sources

Use existing OpenClaw gateway APIs where possible:

- **Running CC/Codex sessions:** `GET /api/coding-sessions`
  - Fields include `id`, `taskId`, `title`, `status`, `branch`, `worktreeRelative`, `execSessionId`, `startedAt`, `finishedAt`, `summary`, `error`.
  - Log streaming: `GET /api/coding-sessions/:id/log?offset=<n>&limit=<n>`
  - Controls: `POST /api/coding-sessions/:id/kill`, `POST /api/coding-sessions/:id/dismiss`, `POST /api/coding-sessions/:id/respond`
  - Open terminal: `POST /api/coding-sessions/:id/terminal`
- **Abort active chat runs:** `chat.abort` gateway RPC with `{ sessionKey, runId? }`
- **Open worktrees/sims/webviews:** derive from open panel layouts (panel store) until explicit telemetry exists.

### Routing Chat

Home hosts the routing chat for general questions.

Routing behavior:

- If a routed project exists and the tab is open, focus it and move the thread there.
- If the tab is not open, create it and move the thread there.
- If routing is unclear, keep the thread in Home.

## Panel Engine

### Library: react-resizable-panels

Using Brian Vaughn's `react-resizable-panels` (already installed in Track 1).

### Components to Build

```
src/renderer/src/components/panels/
├── PanelContainer.tsx      # Root: renders PanelLayout tree
├── PanelContent.tsx        # Renders correct component for PanelType
├── PanelToolbar.tsx        # Per-panel header (title, close, split buttons)
├── PanelPlaceholder.tsx    # Empty panel state
├── ChatPanel.tsx           # Chat view (stub — Track 4 fills this in)
├── CodeEditorPanel.tsx     # File preview (stub — read-only Monaco or plain)
├── CodingSessionPanel.tsx  # CC/Codex session monitor (stub)
├── LinearBoardPanel.tsx    # Linear kanban (stub — Track 3 fills this in)
├── BrowserPanel.tsx        # Embedded web view via webview tag (stub)
├── TerminalPanel.tsx       # Terminal output (stub)
└── EmptyPanel.tsx          # "Drop content here" or "Split to add"
```

### PanelContainer.tsx

Recursively renders the `PanelLayout` tree from the panel store:

```tsx
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

function PanelContainer({ threadId }: { threadId: string }) {
  const layout = usePanelStore((s) => s.getLayout(threadId));

  if (!layout) {
    // Default: single chat panel
    return <PanelContent type="chat" threadId={threadId} />;
  }

  return <RenderNode node={layout.root} threadId={threadId} />;
}

function RenderNode({ node, threadId }: { node: PanelNode; threadId: string }) {
  if (node.type === "leaf") {
    return (
      <Panel id={node.panelId} order={0}>
        <PanelToolbar panelId={node.panelId} threadId={threadId} />
        <PanelContent type={node.panelType} props={node.props} threadId={threadId} />
      </Panel>
    );
  }

  return (
    <PanelGroup direction={node.direction} onLayout={(sizes) => handleResize(threadId, sizes)}>
      <Panel defaultSize={node.sizes[0]}>
        <RenderNode node={node.children[0]} threadId={threadId} />
      </Panel>
      <PanelResizeHandle className="panel-resize-handle" />
      <Panel defaultSize={node.sizes[1]}>
        <RenderNode node={node.children[1]} threadId={threadId} />
      </Panel>
    </PanelGroup>
  );
}
```

### PanelToolbar.tsx

Each panel has a small toolbar at the top:

```
┌─────────────────────────────────────────┐
│ 📄 file.ts          [⬜ Split] [✕ Close] │
├─────────────────────────────────────────┤
│                                          │
│          Panel Content                   │
│                                          │
└─────────────────────────────────────────┘
```

- Title derived from panel type + props (file name, session name, etc.)
- Split button: splits this panel horizontally or vertically (dropdown: Split Right / Split Down)
- Close button: removes this panel, parent absorbs sibling
- Toolbar is 32px height, only shows on hover (auto-hides to maximize content area)

### Panel Operations

Implement in the panel store:

```ts
// Split a panel into two
splitPanel(threadId: string, panelId: string, direction: 'horizontal' | 'vertical', newPanelType: PanelType): void

// Close a panel (sibling takes over parent space)
closePanel(threadId: string, panelId: string): void

// Update panel props (e.g., change file path in code editor)
updatePanelProps(threadId: string, panelId: string, props: Record<string, unknown>): void

// Reset to single chat panel
resetLayout(threadId: string): void
```

### Layout Persistence

The panel store already persists to localStorage (Track 1). Key behaviors:

- On panel resize → debounce 300ms → save sizes to store
- On split/close → save immediately
- On thread switch → load that thread's layout from store
- If no layout exists for thread → default single chat panel
- Layouts survive app restart (localStorage via Zustand persist)

## Thread System

### Components

```
src/renderer/src/components/threads/
├── ThreadList.tsx          # Scrollable list of threads (in sidebar)
├── ThreadItem.tsx          # Single thread row
├── ThreadSearch.tsx        # Search/filter threads
└── NewThreadButton.tsx     # Create new thread
```

### ThreadList.tsx

Lives in the sidebar. Shows threads scoped to the active tab, grouped by project:

```
┌──────────────────────┐
│ 🔍 Search threads... │
│                      │
│ ▾ PayMe Backend      │
│   ● Fix auth flow    │
│   ○ KOS-5: Sessions  │
│   ○ Billshark sync   │
│                      │
│ ▾ Relay              │
│   ○ Video pipeline   │
│                      │
│ ▾ Unsorted           │
│   ○ Quick question   │
│                      │
│ [+ New Thread]       │
└──────────────────────┘
```

- `●` = active thread (highlighted)
- Threads sorted by `lastMessageAt` descending within each project
- "Unsorted" section for threads with no project
- Click thread → set active for the current tab, load its panel layout
- Collapsible project sections (persisted)

### ThreadItem.tsx

```
┌──────────────────────────┐
│ Fix auth flow          ● │  ← status indicator (streaming/idle)
│ 2 min ago                │
└──────────────────────────┘
```

- Title (truncated to 1 line)
- Relative timestamp ("2 min ago", "yesterday", etc.)
- Status dot: green (streaming), gray (idle), blue (has unread)
- Right-click context menu: Archive, Move to Project, Copy Session Key

### Thread ↔ Gateway Sync

Threads map to OpenClaw sessions. When the gateway sends session events:

```ts
// Gateway events to listen for:
// "session.created" → create thread
// "session.updated" → update thread title/status
// "session.message" → update lastMessageAt, trigger unread indicator
// "session.stream.start" → set thread status to streaming
// "session.stream.end" → set thread status to idle

useGatewayEvent("session.list", (payload) => {
  // On connect, gateway sends full session list
  // Sync threads: create missing, update existing, mark removed as archived
  // Unassigned sessions default to Home tab of the active workspace
});
```

### New Thread Creation

"New Thread" button → creates a new OpenClaw session via gateway RPC:

```ts
const result = await gateway.request("session.create", {
  label: "New conversation",
});
// result.sessionKey → create Thread in store, set active
```

## Adaptive Panel Triggers

Panels appear automatically based on agent activity. This is the "kOS magic" — the right panels appear at the right time without user intervention.

### Trigger Rules

Agent ActivityPanel ActionCC/Codex session startsOpen `coding-session` panel (split right)Write/Edit tool completesOpen `code-editor` panel with file pathBrowser tool usedOpen `browser` panel (split right)Linear issue referencedOpen `linear-board` panel (if not already open)

### Implementation

```ts
// In the gateway event handler:
function handleToolEvent(event: ToolStreamEvent) {
  const { threadId, toolName, result } = event;
  const layout = panelStore.getLayout(threadId);

  // Don't auto-open if user has closed this panel type before in this thread
  const dismissed = getDismissedPanelTypes(threadId);

  if (toolName === "exec" && isCodingAgentExec(result)) {
    if (!dismissed.has("coding-session") && !hasPanel(layout, "coding-session")) {
      panelStore.splitPanel(threadId, "chat", "horizontal", "coding-session");
    }
  }

  if ((toolName === "Write" || toolName === "Edit") && result?.filePath) {
    if (!dismissed.has("code-editor")) {
      openOrUpdateCodeEditor(threadId, result.filePath);
    }
  }
}
```

### Dismiss Tracking

When a user closes an auto-opened panel, track that they dismissed it:

- Store `dismissedPanelTypes` per thread in localStorage
- Don't auto-open the same type again in that thread
- Reset on "Reset Layout" action

## Keyboard Shortcuts

ShortcutAction
`Cmd+T`New tab (project picker)
`Cmd+W`Close active tab
`Cmd+Shift+W`Close active panel
`Cmd+1` through `Cmd+9`Switch tabs
`Cmd+Shift+1` through `Cmd+Shift+9`Switch threads within tab
`Ctrl+Tab` / `Ctrl+Shift+Tab`Cycle tabs
`Cmd+N`New thread (active tab)
`Cmd+K`Thread search (active tab)
`Cmd+\`Toggle sidebar
`Cmd+Shift+\`Split panel right

## Styling

- Panel resize handles: 4px wide, subtle gray, blue on hover/drag
- Panel toolbar: transparent by default, shows on hover with gentle fade
- Active panel: subtle blue border (1px) on the toolbar area
- Transitions: panel open/close should animate (200ms ease-out)

## Acceptance Criteria

1.  Top tab bar renders with a pinned Home tab
2.  Home tab shows dashboard sections + routing chat
3.  `Cmd+T` opens a project tab (or focuses if already open)
4.  Closing a tab removes it from the tab bar and persists state
5.  Click a thread → main area shows its panel layout (scoped to active tab)
6.  Default layout = single chat panel (placeholder content is fine)
7.  Split Right from toolbar → panel splits horizontally, each half resizable
8.  Split Down from toolbar → panel splits vertically
9.  Close panel → sibling expands to fill space
10. Resize panels → sizes persist when switching threads and coming back
11. Layouts persist across app restart
12. Thread list shows in sidebar, grouped by project (scoped to active tab)
13. Click thread in sidebar → switches active thread + layout within tab
14. New Thread button creates a session via gateway and activates it in the active tab
15. `Cmd+\` toggles sidebar
16. `Cmd+K` opens thread search overlay (fuzzy match on title) for active tab

## Do NOT

- Do not implement chat message rendering (Track 4)
- Do not implement Linear board content (Track 3)
- Do not implement actual code editor (just show file path + placeholder text)
- Do not implement actual terminal (just placeholder)
- Do not implement browser embedding (just placeholder with URL)
- Do not implement the adaptive trigger system yet (just the infrastructure — `splitPanel`, `closePanel`, etc.)
- Stub panels are fine: just render their type name and props as text
- Do not implement native window tabs
