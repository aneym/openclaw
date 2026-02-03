# SPEC: kOS Electron App Scaffold (Track 1)

> **Covers:** KOS-1 (Data Model) + Electron scaffold
> **Blocks:** Tracks 2, 3, 4
> **Directory:** `kos/` in the repo root
> **Build tool:** electron-vite

## Goal

Create the `kos/` directory with a working Electron app scaffold: electron-vite + React 19 + TypeScript + shadcn/ui + Tailwind CSS + Zustand. Include the core data model types and a working gateway WebSocket client ported from the existing Lit UI. The app should launch, connect to a running gateway, and show a shell layout (sidebar + main area).

## Directory Structure

```
kos/
├── package.json
├── electron.vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.web.json
├── tailwind.config.ts
├── postcss.config.js
├── components.json              # shadcn config
├── src/
│   ├── main/                    # Electron main process
│   │   ├── index.ts             # App entry, window creation
│   │   └── window-state.ts      # Persist window position/size
│   ├── preload/
│   │   ├── index.ts             # Context bridge
│   │   └── index.d.ts           # Type declarations
│   └── renderer/                # React app (Vite)
│       ├── index.html
│       ├── src/
│       │   ├── main.tsx         # React entry
│       │   ├── App.tsx          # Root component
│       │   ├── types/           # Core data model
│       │   │   ├── workspace.ts
│       │   │   ├── project.ts
│       │   │   ├── thread.ts
│       │   │   ├── message.ts
│       │   │   ├── panel.ts
│       │   │   └── index.ts     # Re-exports
│       │   ├── stores/          # Zustand stores
│       │   │   ├── workspace-store.ts
│       │   │   ├── thread-store.ts
│       │   │   ├── panel-store.ts
│       │   │   └── gateway-store.ts
│       │   ├── gateway/         # Gateway client
│       │   │   ├── client.ts    # WebSocket client (ported from ui/src/ui/gateway.ts)
│       │   │   ├── types.ts     # Protocol types
│       │   │   └── hooks.ts     # React hooks (useGateway, useSession, etc.)
│       │   ├── components/      # shadcn + custom
│       │   │   ├── ui/          # shadcn components (auto-generated)
│       │   │   └── layout/
│       │   │       ├── Shell.tsx      # Sidebar + main content area
│       │   │       ├── Sidebar.tsx    # Project/thread navigation
│       │   │       └── StatusBar.tsx  # Connection status, workspace indicator
│       │   ├── lib/
│       │   │   └── utils.ts     # cn() helper for shadcn
│       │   └── styles/
│       │       └── globals.css  # Tailwind base + shadcn theme
│       └── env.d.ts
└── resources/                   # App icons
```

## Core Data Model (src/renderer/src/types/)

### workspace.ts
```ts
export interface Workspace {
  id: string;
  name: string;                    // "Work", "Personal"
  icon?: string;                   // emoji or URL
  projects: string[];              // project IDs
  gatewayUrl: string;              // ws://localhost:3579
  gatewayToken?: string;
  linearApiKey?: string;
  createdAt: number;
}

export interface WorkspaceConfig {
  activeWorkspaceId: string;
  workspaces: Workspace[];
}
```

### project.ts
```ts
export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  icon?: string;                   // emoji
  color?: string;                  // hex
  linearTeamId?: string;           // Linear team for this project
  repoPath?: string;               // local git repo path
  skills: string[];                // enabled skill IDs
  threadIds: string[];             // threads in this project
  createdAt: number;
}
```

### thread.ts
```ts
export interface Thread {
  id: string;
  projectId?: string;              // null = unsorted
  sessionKey: string;              // OpenClaw session key
  title: string;
  subtitle?: string;               // e.g. "KOS-7: UI Layout"
  linearIssueId?: string;          // linked Linear issue
  panelLayoutId?: string;          // persisted panel layout
  status: ThreadStatus;
  lastMessageAt: number;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export type ThreadStatus = 'active' | 'idle' | 'archived';
```

### message.ts

Adopt the AI SDK parts-based model:

```ts
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  parts: MessagePart[];
  createdAt: number;
  threadId: string;
  metadata?: Record<string, unknown>;
}

export type MessagePart =
  | TextPart
  | ToolCallPart
  | ToolResultPart
  | ReasoningPart
  | ImagePart
  | AudioPart;

export interface TextPart {
  type: 'text';
  text: string;
}

export interface ToolCallPart {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  state: ToolCallState;
}

export type ToolCallState = 'streaming' | 'pending' | 'complete' | 'error';

export interface ToolResultPart {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError?: boolean;
}

export interface ReasoningPart {
  type: 'reasoning';
  reasoning: string;
  durationMs?: number;
}

export interface ImagePart {
  type: 'image';
  url: string;
  alt?: string;
}

export interface AudioPart {
  type: 'audio';
  url: string;
  filename?: string;
}
```

### panel.ts
```ts
export interface PanelLayout {
  id: string;
  threadId: string;
  root: PanelNode;
  updatedAt: number;
}

export type PanelNode = PanelBranch | PanelLeaf;

export interface PanelBranch {
  type: 'branch';
  direction: 'horizontal' | 'vertical';
  sizes: [number, number];         // percentages, e.g. [60, 40]
  children: [PanelNode, PanelNode];
}

export interface PanelLeaf {
  type: 'leaf';
  panelId: string;
  panelType: PanelType;
  props?: Record<string, unknown>; // panel-specific props (file path, session key, etc.)
}

export type PanelType =
  | 'chat'            // Main chat view
  | 'code-editor'     // File preview/edit
  | 'terminal'        // Terminal output
  | 'coding-session'  // CC/Codex session monitor
  | 'linear-board'    // Linear kanban
  | 'browser'         // Embedded web view
  | 'preview'         // App preview (simulator, web)
  | 'diff'            // Git diff view
  | 'empty';          // Placeholder
```

## Gateway Client (src/renderer/src/gateway/)

Port the existing `GatewayBrowserClient` from `ui/src/ui/gateway.ts`. Key changes:

### client.ts

Same WebSocket protocol, but simplified for Electron:
- Remove device identity/signing (Electron uses token auth directly)
- Keep: reconnect with backoff, sequence gap detection, request/response with pending map
- Keep: `onHello`, `onEvent`, `onClose`, `onGap` callbacks
- Add: `onReconnect` callback for UI updates
- Export as a singleton via Zustand store (not class instance per component)

```ts
// Simplified connect — no device auth ceremony in Electron
// Token comes from workspace config
export class GatewayClient {
  // ... same WebSocket lifecycle as ui/src/ui/gateway.ts
  // Simplified: no device identity, no crypto.subtle
  // Token-based auth only
}
```

### hooks.ts

```ts
import { useGatewayStore } from '../stores/gateway-store';

export function useGateway() {
  return useGatewayStore(s => ({
    connected: s.connected,
    send: s.send,
    request: s.request,
  }));
}

export function useGatewayEvent(event: string, handler: (payload: unknown) => void) {
  // Subscribe to specific gateway events
  // Unsubscribe on unmount
}

export function useSession(sessionKey: string) {
  // Subscribe to session events (messages, stream, status)
  // Return { messages, isStreaming, status }
}
```

## Zustand Stores (src/renderer/src/stores/)

### workspace-store.ts
```ts
interface WorkspaceState {
  config: WorkspaceConfig;
  activeWorkspace: Workspace | null;
  setActiveWorkspace: (id: string) => void;
  addWorkspace: (ws: Workspace) => void;
  updateWorkspace: (id: string, patch: Partial<Workspace>) => void;
}

// Persist to localStorage
export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({ /* ... */ }),
    { name: 'kos-workspaces' }
  )
);
```

### gateway-store.ts
```ts
interface GatewayState {
  client: GatewayClient | null;
  connected: boolean;
  error: string | null;
  connect: (url: string, token?: string) => void;
  disconnect: () => void;
  request: <T>(method: string, params?: unknown) => Promise<T>;
  subscribe: (event: string, handler: (payload: unknown) => void) => () => void;
}
```

### thread-store.ts
```ts
interface ThreadState {
  threads: Map<string, Thread>;
  activeThreadId: string | null;
  setActiveThread: (id: string) => void;
  addThread: (thread: Thread) => void;
  updateThread: (id: string, patch: Partial<Thread>) => void;
  archiveThread: (id: string) => void;
}

export const useThreadStore = create<ThreadState>()(
  persist(
    (set, get) => ({ /* ... */ }),
    { name: 'kos-threads' }
  )
);
```

### panel-store.ts
```ts
interface PanelState {
  layouts: Map<string, PanelLayout>;  // threadId → layout
  getLayout: (threadId: string) => PanelLayout | undefined;
  setLayout: (threadId: string, layout: PanelLayout) => void;
  updateSizes: (threadId: string, panelId: string, sizes: number[]) => void;
}

export const usePanelStore = create<PanelState>()(
  persist(
    (set, get) => ({ /* ... */ }),
    { name: 'kos-panels' }
  )
);
```

## Shell Layout (src/renderer/src/components/layout/)

### Shell.tsx
```
┌──────────────────────────────────────────────────┐
│ [StatusBar: workspace name | connection status]   │
├────────┬─────────────────────────────────────────┤
│        │                                          │
│ Side-  │           Main Content                   │
│ bar    │       (thread / welcome)                 │
│        │                                          │
│ - Proj │                                          │
│ - Proj │                                          │
│ - ...  │                                          │
│        │                                          │
├────────┴─────────────────────────────────────────┤
│ [StatusBar: agent status | session info]           │
└──────────────────────────────────────────────────┘
```

- Sidebar: 240px default, collapsible, resizable
- Main area: renders active thread's panel layout (or welcome screen if none)
- Status bar: connection indicator (green dot / red dot / yellow spinner), workspace name

## Electron Main Process

### index.ts

```ts
import { app, BrowserWindow } from 'electron';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import { restoreWindowState, trackWindowState } from './window-state';

function createWindow() {
  const saved = restoreWindowState();
  const win = new BrowserWindow({
    width: saved?.width ?? 1400,
    height: saved?.height ?? 900,
    x: saved?.x,
    y: saved?.y,
    titleBarStyle: 'hiddenInset',    // macOS native title bar
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
    },
  });
  trackWindowState(win);

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.kinetic.kos');
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window));
  createWindow();
});
```

### window-state.ts

Persist window bounds to disk (JSON file). Debounce writes on move/resize.

## Setup Steps

1. `cd kos && npm init -y`
2. Install electron-vite: `npm i -D electron-vite electron @electron-toolkit/utils @electron-toolkit/preload`
3. Install React: `npm i react react-dom && npm i -D @types/react @types/react-dom @vitejs/plugin-react`
4. Install Tailwind: `npm i -D tailwindcss @tailwindcss/vite` (Tailwind v4 — uses CSS `@import "tailwindcss"`, no config file needed)
5. Install shadcn deps: `npx shadcn@latest init` (New York style, Zinc color, CSS variables: yes)
6. Install Zustand: `npm i zustand`
7. Install panel library: `npm i react-resizable-panels`
8. Add shadcn components: `npx shadcn@latest add button input scroll-area separator tooltip`

## electron.vite.config.ts

```ts
import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
      },
    },
    plugins: [react(), tailwindcss()],
  },
});
```

## Acceptance Criteria

1. `cd kos && npm install && npm run dev` launches an Electron window
2. Window shows the shell layout (sidebar + main area + status bar)
3. Status bar shows "Disconnected" (red dot) by default
4. If gateway is running on localhost:3579, status shows "Connected" (green dot)
5. Sidebar shows placeholder project list
6. Main area shows welcome screen with workspace name
7. Window position/size persists across restarts
8. All TypeScript types compile with strict mode
9. Hot reload works: edit a React component → updates in <500ms without restart
10. Tailwind classes work, shadcn Button component renders correctly
11. `hiddenInset` title bar with macOS traffic lights positioned correctly

## Do NOT

- Do not implement chat UI (Track 4)
- Do not implement panel splitting/resizing (Track 2)
- Do not implement Linear integration (Track 3)
- Do not implement message rendering
- Do not add tests yet
- Do not add any IPC channels beyond the preload basics
- Do not implement workspace switching UI (just support the data model)
