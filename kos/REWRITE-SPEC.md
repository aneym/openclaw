# kOS Complete Rewrite Specification

## Overview

kOS is an AI-native workspace for Kinetic. Complete rewrite of the existing codebase to match the new design vision.

**Keep:** electron-vite, React 19, TypeScript, Tailwind v4, shadcn/ui (27 components), gateway WebSocket client, react-resizable-panels
**Rewrite:** Data model, stores, components, hierarchy

---

## Core Hierarchy

```
Project (PayMe, Relay, kOS, Wedding Planning)
└── Workspace (main, feat/auth, hotfix/billing)  ← tied to git worktree
    └── Chats (conversations with agent)
    └── Panel Layout (persists here)
    └── Tasks (Linear OR local)
```

### Key Rules

1. **Project** = the product/repo (highest level). Shown as tabs in top bar.
2. **Workspace** = git worktree (for code projects) OR named context (for non-code). Hidden if only 1 exists per project.
3. **Chat** = conversation with agent. Inherits workspace context (directory, branch). Multiple chats per workspace.
4. **Panel Layout** = persists per workspace, NOT per chat. Switching chats changes chat panel content, not the layout.
5. **Tasks** = Linear issues (if project has linearTeamId) OR local tasks (same UI, different backend).

---

## Data Model

### Types (src/renderer/src/types/)

```typescript
// project.ts
export interface Project {
  id: string;
  name: string;
  icon?: string; // emoji
  color?: string; // hex for tab
  linearTeamId?: string; // null = use local tasks
  repositoryPath?: string; // null = non-code project
  createdAt: number;
}

// workspace.ts
export interface Workspace {
  id: string;
  projectId: string;
  name: string; // "main", "feat/auth"
  path?: string; // git worktree path (code projects)
  branch?: string; // git branch name
  isDefault: boolean; // true for "main" workspace
  createdAt: number;
}

// chat.ts
export interface Chat {
  id: string;
  workspaceId: string; // chats belong to workspaces
  sessionKey: string; // OpenClaw session key
  title: string;
  subtitle?: string; // e.g. "KOS-7: UI Layout"
  linkedTaskId?: string; // optional task link
  status: "active" | "idle" | "archived";
  lastMessageAt: number;
  createdAt: number;
}

// task.ts
export interface Task {
  id: string;
  workspaceId: string;
  source: "linear" | "local";
  identifier?: string; // "KOS-7" or auto-generated
  title: string;
  description?: string;
  status: TaskStatus;
  priority: number; // 0=none, 1=urgent, 2=high, 3=medium, 4=low
  linearIssueId?: string; // if source === 'linear'
  assigneeId?: string;
  labels?: string[];
  createdAt: number;
  updatedAt: number;
}

export type TaskStatus = "backlog" | "todo" | "in_progress" | "in_review" | "done" | "cancelled";

// panel.ts
export type PanelType =
  | "chat" // conversation (always present)
  | "coding-session" // CC/Codex terminal output
  | "terminal" // shell, logs, dev server
  | "browser" // agent's browser view
  | "preview" // iOS simulator, web preview
  | "tasks" // kanban board
  | "code" // diff view, file browser
  | "empty"; // placeholder

export interface PanelState {
  id: string;
  type: PanelType;
  sessionId?: string; // linked CC session, terminal session, etc.
  data?: Record<string, unknown>; // panel-specific state
  isUserOpened: boolean; // user opened vs auto-spawned
}

// Binary tree for panel splits
export type PanelNode = PanelBranch | PanelLeaf;

export interface PanelBranch {
  type: "branch";
  direction: "horizontal" | "vertical";
  children: [PanelNode, PanelNode];
  sizes: [number, number]; // percentages
}

export interface PanelLeaf {
  type: "leaf";
  panelId: string; // references PanelState.id
}

export interface PanelLayout {
  root: PanelNode;
  panels: Map<string, PanelState>;
}

// message.ts (keep existing parts-based model)
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  parts: MessagePart[];
  chatId: string; // was threadId
  createdAt: number;
}

export type MessagePart =
  | TextPart
  | ToolCallPart
  | ToolResultPart
  | ReasoningPart
  | ImagePart
  | AudioPart;

// (keep existing part interfaces)
```

### Stores (src/renderer/src/stores/)

```typescript
// project-store.ts
interface ProjectStore {
  projects: Map<string, Project>;
  activeProjectId: string | null;

  // Actions
  setActiveProject: (id: string) => void;
  addProject: (project: Project) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;

  // Selectors
  getProject: (id: string) => Project | undefined;
  getActiveProject: () => Project | undefined;
}

// workspace-store.ts
interface WorkspaceStore {
  workspaces: Map<string, Workspace>;
  activeWorkspaceId: string | null; // per-project active workspace

  // Actions
  setActiveWorkspace: (projectId: string, workspaceId: string) => void;
  addWorkspace: (workspace: Workspace) => void;
  updateWorkspace: (id: string, updates: Partial<Workspace>) => void;
  deleteWorkspace: (id: string) => void;

  // Selectors
  getWorkspacesForProject: (projectId: string) => Workspace[];
  getActiveWorkspace: (projectId: string) => Workspace | undefined;
  shouldShowWorkspaceUI: (projectId: string) => boolean; // true if >1 workspace
}

// chat-store.ts
interface ChatStore {
  chats: Map<string, Chat>;
  activeChatId: string | null; // per-workspace active chat

  // Actions
  setActiveChat: (workspaceId: string, chatId: string) => void;
  addChat: (chat: Chat) => void;
  updateChat: (id: string, updates: Partial<Chat>) => void;
  archiveChat: (id: string) => void;

  // Selectors
  getChatsForWorkspace: (workspaceId: string) => Chat[];
  getActiveChat: (workspaceId: string) => Chat | undefined;
}

// panel-store.ts
interface PanelStore {
  layouts: Map<string, PanelLayout>; // keyed by workspaceId

  // Actions
  getLayout: (workspaceId: string) => PanelLayout;
  setLayout: (workspaceId: string, layout: PanelLayout) => void;
  spawnPanel: (workspaceId: string, type: PanelType, data?: Record<string, unknown>) => void;
  closePanel: (workspaceId: string, panelId: string) => void;
  splitPanel: (
    workspaceId: string,
    panelId: string,
    direction: "horizontal" | "vertical",
    newType: PanelType,
  ) => void;
  resizePanels: (workspaceId: string, sizes: number[]) => void;
}

// task-store.ts
interface TaskStore {
  tasks: Map<string, Task>;

  // Actions
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  moveTask: (id: string, newStatus: TaskStatus) => void;

  // Selectors
  getTasksForWorkspace: (workspaceId: string) => Task[];
  getTasksByStatus: (workspaceId: string, status: TaskStatus) => Task[];

  // Linear sync (if project has linearTeamId)
  syncWithLinear: (projectId: string) => Promise<void>;
}

// gateway-store.ts (keep existing, minor updates)
// theme-store.ts (keep existing)
// message-queue-store.ts (keep existing, update threadId → chatId)
```

---

## Adaptive Panel System

### Default State

New workspace starts with **only Chat panel**. Nothing else.

### Activity Triggers

Panels spawn automatically based on gateway events:

| Gateway Event            | Panel Type       | Data            |
| ------------------------ | ---------------- | --------------- |
| `tool.claude_code.start` | `coding-session` | `{ sessionId }` |
| `tool.browser.navigate`  | `browser`        | `{ url }`       |
| `tool.exec.start`        | `terminal`       | `{ command }`   |
| `tool.file.edit`         | `code`           | `{ path }`      |

### Implementation

```typescript
// hooks/use-adaptive-panels.ts
export function useAdaptivePanels(workspaceId: string) {
  const { subscribe } = useGatewayStore();
  const { spawnPanel, getLayout } = usePanelStore();

  useEffect(() => {
    const unsub = subscribe("agent", (event) => {
      const { tool, data } = event;

      // Don't spawn if panel type already exists
      const layout = getLayout(workspaceId);
      const existingTypes = new Set([...layout.panels.values()].map((p) => p.type));

      if (
        tool === "claude_code" &&
        data.action === "start" &&
        !existingTypes.has("coding-session")
      ) {
        spawnPanel(workspaceId, "coding-session", { sessionId: data.sessionId });
      }

      if (tool === "browser" && data.action === "navigate" && !existingTypes.has("browser")) {
        spawnPanel(workspaceId, "browser", { url: data.url });
      }

      if (tool === "exec" && !existingTypes.has("terminal")) {
        spawnPanel(workspaceId, "terminal", { command: data.command });
      }
    });

    return unsub;
  }, [workspaceId]);
}
```

### User Can Also

- Manually open any panel (Cmd+Shift+P → panel picker)
- Close panels (persists — won't auto-reopen unless triggered again)
- Resize/rearrange (layout persists per workspace)

---

## UI Components

### Layout (components/layout/)

```
┌─────────────────────────────────────────────────────────────────┐
│ [PayMe] [Relay] [kOS] [Wedding] [+]                         ⚙️  │  ← ProjectTabs
├──────────┬──────────────────────────────────────────────────────┤
│          │ ┌──────────────────────────────────────────────────┐ │
│ WORKSPACES (if >1)                                            │ │
│ ▸ main   │ │                                                  │ │
│   feat/auth ←│ │              CHAT PANEL                      │ │
│   hotfix │ │                                                  │ │
│          │ │  Messages...                                     │ │
│ CHATS    │ │                                                  │ │
│ • Login  │ │                                                  │ │
│ • Auth ← │ │  [Compose Bar]                                   │ │
│ • Deploy │ └──────────────────────────────────────────────────┘ │
│          │                                                      │
│ ───────  │     (panels spawn here based on activity)           │
│ 📊 Tasks │                                                      │
│ ⚙️ Settings                                                     │
└──────────┴──────────────────────────────────────────────────────┘
│                         StatusBar                               │
└─────────────────────────────────────────────────────────────────┘
```

### Component Structure

```
components/
├── layout/
│   ├── Shell.tsx              # Root layout
│   ├── ProjectTabs.tsx        # Top bar with project tabs
│   ├── Sidebar.tsx            # Workspace list + Chat list + nav
│   ├── StatusBar.tsx          # Gateway status, workspace info
│   └── CommandPalette.tsx     # Cmd+K search
├── sidebar/
│   ├── WorkspaceList.tsx      # Workspace switcher (conditional)
│   ├── ChatList.tsx           # Chat list for active workspace
│   ├── ChatItem.tsx           # Single chat item
│   └── SidebarNav.tsx         # Tasks, Settings links
├── panels/
│   ├── PanelContainer.tsx     # Renders panel layout tree
│   ├── PanelContent.tsx       # Routes panel type to component
│   ├── PanelToolbar.tsx       # Panel header with actions
│   ├── ChatPanel.tsx          # Chat messages + compose
│   ├── CodingSessionPanel.tsx # CC/Codex output (keep existing)
│   ├── TerminalPanel.tsx      # Shell output
│   ├── BrowserPanel.tsx       # Embedded browser view
│   ├── PreviewPanel.tsx       # Simulator/web preview
│   ├── TasksPanel.tsx         # Kanban board
│   └── CodePanel.tsx          # Diff/file browser
├── chat/
│   ├── MessageList.tsx        # Keep existing
│   ├── MessageGroup.tsx       # Keep existing
│   ├── TextPart.tsx           # Keep existing
│   ├── ToolCallChip.tsx       # Keep existing
│   ├── ReasoningBlock.tsx     # Keep existing
│   ├── ComposeBar.tsx         # Update to pass workspace context
│   └── StreamingIndicator.tsx # Keep existing
├── tasks/
│   ├── TaskBoard.tsx          # Kanban board (Linear + local)
│   ├── TaskColumn.tsx         # Status column
│   ├── TaskCard.tsx           # Task card
│   └── TaskDialog.tsx         # Create/edit task
└── settings/
    ├── Settings.tsx           # Keep existing
    ├── AppearanceSettings.tsx # Keep existing
    └── WorkspaceSettings.tsx  # New: manage workspaces
```

---

## Mock Data

For development, populate stores with:

```typescript
// Mock Projects
const projects: Project[] = [
  {
    id: "proj-payme",
    name: "PayMe",
    icon: "💰",
    linearTeamId: "team-pay",
    repositoryPath: "/repos/payme",
  },
  {
    id: "proj-relay",
    name: "Relay",
    icon: "🔗",
    linearTeamId: "team-rel",
    repositoryPath: "/repos/relay",
  },
  {
    id: "proj-kos",
    name: "kOS",
    icon: "🤖",
    linearTeamId: "team-kos",
    repositoryPath: "/repos/kos",
  },
  { id: "proj-wedding", name: "Wedding", icon: "💒", repositoryPath: null }, // non-code
];

// Mock Workspaces
const workspaces: Workspace[] = [
  // PayMe has multiple workspaces (power user)
  {
    id: "ws-payme-main",
    projectId: "proj-payme",
    name: "main",
    path: "/repos/payme",
    branch: "main",
    isDefault: true,
  },
  {
    id: "ws-payme-auth",
    projectId: "proj-payme",
    name: "feat/auth",
    path: "/repos/payme-auth",
    branch: "feat/auth",
    isDefault: false,
  },
  {
    id: "ws-payme-hotfix",
    projectId: "proj-payme",
    name: "hotfix/billing",
    path: "/repos/payme-hotfix",
    branch: "hotfix/billing",
    isDefault: false,
  },

  // Relay has 1 workspace (normal user)
  {
    id: "ws-relay-main",
    projectId: "proj-relay",
    name: "main",
    path: "/repos/relay",
    branch: "main",
    isDefault: true,
  },

  // kOS has 1 workspace
  {
    id: "ws-kos-main",
    projectId: "proj-kos",
    name: "main",
    path: "/repos/kos",
    branch: "main",
    isDefault: true,
  },

  // Wedding has 1 workspace (non-code)
  {
    id: "ws-wedding-main",
    projectId: "proj-wedding",
    name: "Planning",
    path: null,
    branch: null,
    isDefault: true,
  },
];

// Mock Chats
const chats: Chat[] = [
  {
    id: "chat-1",
    workspaceId: "ws-payme-auth",
    sessionKey: "sess-1",
    title: "Implement OAuth flow",
    status: "active",
    lastMessageAt: Date.now(),
  },
  {
    id: "chat-2",
    workspaceId: "ws-payme-auth",
    sessionKey: "sess-2",
    title: "Fix token refresh bug",
    status: "idle",
    lastMessageAt: Date.now() - 3600000,
  },
  {
    id: "chat-3",
    workspaceId: "ws-payme-main",
    sessionKey: "sess-3",
    title: "Deploy question",
    status: "active",
    lastMessageAt: Date.now(),
  },
  {
    id: "chat-4",
    workspaceId: "ws-wedding-main",
    sessionKey: "sess-4",
    title: "Venue research",
    status: "active",
    lastMessageAt: Date.now(),
  },
];

// Mock Tasks
const tasks: Task[] = [
  {
    id: "task-1",
    workspaceId: "ws-payme-auth",
    source: "linear",
    identifier: "PAY-123",
    title: "Implement OAuth",
    status: "in_progress",
    priority: 2,
  },
  {
    id: "task-2",
    workspaceId: "ws-payme-auth",
    source: "linear",
    identifier: "PAY-124",
    title: "Add refresh token",
    status: "todo",
    priority: 3,
  },
  {
    id: "task-3",
    workspaceId: "ws-wedding-main",
    source: "local",
    identifier: "W-1",
    title: "Book venue tour",
    status: "todo",
    priority: 2,
  },
  {
    id: "task-4",
    workspaceId: "ws-wedding-main",
    source: "local",
    identifier: "W-2",
    title: "Send save the dates",
    status: "backlog",
    priority: 4,
  },
];
```

---

## Implementation Order

1. **Types** — Define all new types in `types/`
2. **Stores** — Implement stores with mock data, localStorage persistence
3. **Shell + ProjectTabs** — Basic layout with project switching
4. **Sidebar** — Workspace list (conditional), Chat list
5. **PanelContainer** — Render layout tree with chat panel
6. **ChatPanel** — Reuse existing chat components
7. **Adaptive panels hook** — Activity-based spawning
8. **TaskBoard** — Unified Linear + local tasks
9. **Other panels** — CodingSession, Terminal, Browser, etc.
10. **Gateway integration** — Connect to real gateway

---

## What to Keep

- `gateway/client.ts` — WebSocket client (works)
- `components/ui/*` — All shadcn components
- `lib/theme-applier.ts`, `lib/built-in-themes.ts` — Theme system
- `components/chat/TextPart.tsx`, `ToolCallChip.tsx`, etc. — Message rendering
- `components/coding/*` — Coding session panel
- `components/linear/LinearBoard.tsx` → adapt to TaskBoard
- Electron main process, preload (minor updates)

---

## What to Delete

- `types/thread.ts` → replaced by `chat.ts`
- `stores/thread-store.ts` → replaced by `chat-store.ts`
- `stores/tab-store.ts` → not needed (no tab system)
- Old workspace/project hierarchy code
- Thread-specific panel logic

---

## Success Criteria

1. Can switch between projects via top tabs
2. PayMe shows workspace switcher (3 workspaces), Relay/kOS/Wedding don't (1 each)
3. Selecting workspace shows its chats in sidebar
4. Chat panel shows messages, can send new messages
5. Starting a CC session auto-spawns coding-session panel
6. Panel layout persists when switching chats within same workspace
7. Panel layout resets when switching workspaces
8. Tasks panel shows Linear issues (PayMe) or local tasks (Wedding)
9. All state persists to localStorage
