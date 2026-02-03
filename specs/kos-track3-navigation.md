# kOS Track 3: Project Navigation + Linear Board

## Implementation Spec

**Status:** Draft  
**Depends on:** Track 1 (scaffold), Track 2 (panels + threads)  
**Builds:** Workspace switching, sidebar navigation, project views, Linear kanban board, config loading, task-thread linking

---

## 1. Overview

Track 3 adds the navigation layer to kOS. Users can organize work into workspaces (Work, Personal, etc.), each containing projects. Projects optionally integrate with external tools via skills — Linear for issue tracking, Notion for docs, etc. The sidebar is the primary navigation surface; clicking a project shows either a kanban board (Linear-backed) or a thread list (general-purpose).

**Key principle:** kOS is general-purpose. A "project" is just a named container with optional skill integrations. Not every project is a dev project.

---

## 2. File Structure

```
src/
├── config/
│   ├── types.ts                    # KosConfig, Workspace, Project interfaces
│   ├── ipc.ts                      # IPC channel definitions for config loading
│   └── useConfig.ts                # Zustand store for config state
├── stores/
│   └── navigationStore.ts          # Active workspace, project, view state
├── components/
│   ├── sidebar/
│   │   ├── Sidebar.tsx             # Root sidebar component
│   │   ├── WorkspaceSwitcher.tsx   # Dropdown to toggle workspaces
│   │   ├── ProjectList.tsx         # List of projects in active workspace
│   │   ├── ProjectItem.tsx         # Single project row (icon + name + badge)
│   │   ├── RecentThreads.tsx       # Quick-access recent/active threads
│   │   └── SidebarFooter.tsx       # Settings link, user info
│   ├── project/
│   │   ├── ProjectView.tsx         # Router: kanban vs thread-list
│   │   ├── ProjectHeader.tsx       # Name, icon, thread count, breadcrumb
│   │   └── ProjectThreadList.tsx   # Thread list for non-Linear projects
│   └── linear/
│       ├── KanbanBoard.tsx         # Full kanban layout (columns + cards)
│       ├── KanbanColumn.tsx        # Single workflow-state column
│       ├── IssueCard.tsx           # Card for one Linear issue
│       ├── KanbanFilters.tsx       # Assignee, priority, label filters
│       └── useLinear.ts            # Linear API hook (queries, caching)
├── lib/
│   └── linear/
│       ├── client.ts               # GraphQL client setup
│       ├── queries.ts              # All Linear GraphQL queries
│       └── types.ts                # Linear API response types
└── electron/
    └── config.ts                   # Main-process config file reader
```

---

## 3. TypeScript Interfaces

### 3.1 Config Schema (`src/config/types.ts`)

```typescript
/**
 * Root config file: ~/.kos/config.json
 * Read by Electron main process, sent to renderer via IPC.
 */
export interface KosConfig {
  user: KosUser;
  workspaces: Record<string, WorkspaceConfig>;
  keys: Record<string, string>; // e.g. LINEAR_API_KEY, NOTION_API_KEY
}

export interface KosUser {
  name: string;
  email: string;
  /** Linear user ID for "assigned to me" filtering. Optional. */
  linearUserId?: string;
}

/**
 * A workspace groups related projects.
 * Examples: "work", "personal", "freelance"
 */
export interface WorkspaceConfig {
  /** Display name override (defaults to the key, title-cased) */
  displayName?: string;
  /** Emoji or icon identifier */
  icon?: string;
  projects: Record<string, ProjectConfig>;
}

/**
 * A project is a named container with optional skill integrations.
 * Skills determine what UI and capabilities are available.
 */
export interface ProjectConfig {
  /** Display name override (defaults to the key, title-cased) */
  displayName?: string;
  /** Emoji or icon identifier */
  icon?: string;
  /**
   * Skills this project has. Determines available features.
   * Known skills: "linear", "claude-code", "git", "notion", "calendar", "browser"
   * Unknown skills are stored but ignored by the UI.
   */
  skills: string[];
  /** Linear integration config. Present only if skills includes "linear". */
  linear?: ProjectLinearConfig;
  /** Git repo mappings. Key = repo name, value = local path. */
  repos?: Record<string, string>;
  /** Notion integration config. Future track. */
  notion?: ProjectNotionConfig;
}

export interface ProjectLinearConfig {
  /** Linear team key, e.g. "PAY", "KOS". Used to scope issue queries. */
  teamKey: string;
  /** Override default workflow state ordering. Optional. */
  stateOrder?: string[];
}

export interface ProjectNotionConfig {
  /** Notion database ID. Future track. */
  databaseId?: string;
}

// ---- Resolved types (config key merged in) ----

export interface ResolvedWorkspace {
  id: string;            // config key
  displayName: string;   // config key title-cased, or override
  icon?: string;
  projects: ResolvedProject[];
}

export interface ResolvedProject {
  id: string;            // config key
  workspaceId: string;   // parent workspace key
  displayName: string;
  icon?: string;
  skills: string[];
  linear?: ProjectLinearConfig;
  repos?: Record<string, string>;
  hasLinear: boolean;     // computed: skills.includes("linear") && !!linear
}
```

### 3.2 Navigation State (`src/stores/navigationStore.ts`)

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface NavigationState {
  /** Currently active workspace ID */
  activeWorkspaceId: string | null;
  /** Currently active project ID (within the active workspace) */
  activeProjectId: string | null;
  /** Currently active thread ID (if viewing a thread) */
  activeThreadId: string | null;
  /** Sidebar collapsed state */
  sidebarCollapsed: boolean;

  // Actions
  setActiveWorkspace: (id: string) => void;
  setActiveProject: (id: string | null) => void;
  setActiveThread: (id: string | null) => void;
  toggleSidebar: () => void;
}

export const useNavigationStore = create<NavigationState>()(
  persist(
    (set) => ({
      activeWorkspaceId: null,
      activeProjectId: null,
      activeThreadId: null,
      sidebarCollapsed: false,

      setActiveWorkspace: (id) =>
        set({ activeWorkspaceId: id, activeProjectId: null, activeThreadId: null }),

      setActiveProject: (id) =>
        set({ activeProjectId: id, activeThreadId: null }),

      setActiveThread: (id) =>
        set({ activeThreadId: id }),

      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    {
      name: 'kos-navigation',
      partialize: (state) => ({
        activeWorkspaceId: state.activeWorkspaceId,
        sidebarCollapsed: state.sidebarCollapsed,
        // Don't persist activeProjectId or activeThreadId — stale on restart
      }),
    }
  )
);
```

### 3.3 Thread Descriptor Extension

Extend the existing `ThreadDescriptor` from Track 2:

```typescript
/**
 * Added in Track 3. Existing fields from Track 2 remain unchanged.
 */
export interface ThreadDescriptor {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
  // ... existing Track 2 fields ...

  /** Which project this thread belongs to. Null = standalone. */
  projectId?: string;

  /** Link to an external task (Linear issue, Notion page, etc.) */
  taskRef?: TaskRef;
}

export interface TaskRef {
  /** Source system: "linear", "notion", "github", etc. */
  source: string;
  /** External ID, e.g. "KOS-42" for Linear */
  id: string;
  /** Cached display title from the source system */
  title?: string;
  /** URL to open in browser */
  url?: string;
}
```

### 3.4 Linear API Types (`src/lib/linear/types.ts`)

```typescript
/** Represents a Linear workflow state (column in kanban) */
export interface LinearWorkflowState {
  id: string;
  name: string;
  type: 'backlog' | 'unstarted' | 'started' | 'completed' | 'cancelled';
  color: string;
  position: number;
}

/** Represents a Linear issue (card in kanban) */
export interface LinearIssue {
  id: string;
  identifier: string;     // e.g. "PAY-42"
  title: string;
  description?: string;
  priority: number;        // 0=none, 1=urgent, 2=high, 3=medium, 4=low
  priorityLabel: string;
  url: string;
  state: {
    id: string;
    name: string;
    type: string;
  };
  assignee?: {
    id: string;
    name: string;
    displayName: string;
    avatarUrl?: string;
  };
  labels: {
    nodes: Array<{
      id: string;
      name: string;
      color: string;
    }>;
  };
  createdAt: string;
  updatedAt: string;
}

/** Represents a Linear team */
export interface LinearTeam {
  id: string;
  key: string;
  name: string;
}

/** Represents a Linear user (for assignee filter) */
export interface LinearUser {
  id: string;
  name: string;
  displayName: string;
  avatarUrl?: string;
  email: string;
}

/** Kanban board data: issues grouped by workflow state */
export interface KanbanData {
  states: LinearWorkflowState[];
  issuesByState: Record<string, LinearIssue[]>;
  team: LinearTeam;
}

/** Filter state for kanban board */
export interface KanbanFilters {
  assigneeId: string | null;   // null = all, "me" resolved to config.user.linearUserId
  priority: number | null;      // null = all priorities
  labelId: string | null;       // null = all labels
}
```

---

## 4. Config Loading

### 4.1 Electron Main Process (`src/electron/config.ts`)

```typescript
import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CONFIG_PATH = path.join(os.homedir(), '.kos', 'config.json');

/** IPC channel names */
export const CONFIG_CHANNELS = {
  LOAD: 'kos:config:load',
  RELOAD: 'kos:config:reload',
  UPDATE: 'kos:config:update',
} as const;

/**
 * Read and parse ~/.kos/config.json.
 * Returns null if file doesn't exist. Throws on parse error.
 */
function readConfig(): KosConfig | null {
  if (!fs.existsSync(CONFIG_PATH)) return null;
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Write config back to disk (for settings UI, future track).
 */
function writeConfig(config: KosConfig): void {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export function registerConfigIPC(): void {
  ipcMain.handle(CONFIG_CHANNELS.LOAD, async () => {
    return readConfig();
  });

  ipcMain.handle(CONFIG_CHANNELS.RELOAD, async () => {
    return readConfig();
  });

  ipcMain.handle(CONFIG_CHANNELS.UPDATE, async (_event, config: KosConfig) => {
    writeConfig(config);
    return true;
  });
}
```

### 4.2 Renderer Config Store (`src/config/useConfig.ts`)

```typescript
import { create } from 'zustand';
import type { KosConfig, ResolvedWorkspace, ResolvedProject } from './types';

interface ConfigState {
  config: KosConfig | null;
  loading: boolean;
  error: string | null;

  /** Resolved workspaces (computed from config) */
  workspaces: ResolvedWorkspace[];

  // Actions
  loadConfig: () => Promise<void>;
  reloadConfig: () => Promise<void>;
  getProject: (projectId: string) => ResolvedProject | undefined;
  getWorkspace: (workspaceId: string) => ResolvedWorkspace | undefined;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function resolveConfig(config: KosConfig): ResolvedWorkspace[] {
  return Object.entries(config.workspaces).map(([wsKey, ws]) => ({
    id: wsKey,
    displayName: ws.displayName ?? titleCase(wsKey),
    icon: ws.icon,
    projects: Object.entries(ws.projects).map(([projKey, proj]) => ({
      id: projKey,
      workspaceId: wsKey,
      displayName: proj.displayName ?? titleCase(projKey),
      icon: proj.icon,
      skills: proj.skills,
      linear: proj.linear,
      repos: proj.repos,
      hasLinear: proj.skills.includes('linear') && !!proj.linear,
    })),
  }));
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: null,
  loading: false,
  error: null,
  workspaces: [],

  loadConfig: async () => {
    set({ loading: true, error: null });
    try {
      const config = await window.electronAPI.invoke('kos:config:load');
      if (!config) {
        set({ loading: false, error: 'No config found at ~/.kos/config.json' });
        return;
      }
      set({
        config,
        workspaces: resolveConfig(config),
        loading: false,
      });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  reloadConfig: async () => {
    // Same as load but doesn't clear existing state during load
    try {
      const config = await window.electronAPI.invoke('kos:config:reload');
      if (config) {
        set({ config, workspaces: resolveConfig(config) });
      }
    } catch (err) {
      set({ error: String(err) });
    }
  },

  getProject: (projectId) => {
    for (const ws of get().workspaces) {
      const proj = ws.projects.find((p) => p.id === projectId);
      if (proj) return proj;
    }
    return undefined;
  },

  getWorkspace: (workspaceId) => {
    return get().workspaces.find((ws) => ws.id === workspaceId);
  },
}));
```

### 4.3 Preload Bridge

Add to Electron preload script:

```typescript
// In preload.ts — expose IPC to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
});
```

Type declaration:

```typescript
// src/global.d.ts
interface ElectronAPI {
  invoke(channel: string, ...args: any[]): Promise<any>;
}

interface Window {
  electronAPI: ElectronAPI;
}
```

---

## 5. Linear API Integration

### 5.1 GraphQL Client (`src/lib/linear/client.ts`)

```typescript
import { useConfigStore } from '../../config/useConfig';

const LINEAR_API_URL = 'https://api.linear.app/graphql';

/**
 * Execute a Linear GraphQL query.
 * API key is read from the config store (keys.LINEAR_API_KEY).
 */
export async function linearQuery<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const config = useConfigStore.getState().config;
  const apiKey = config?.keys?.LINEAR_API_KEY;

  if (!apiKey) {
    throw new Error('LINEAR_API_KEY not found in ~/.kos/config.json keys');
  }

  const response = await fetch(LINEAR_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  if (json.errors) {
    throw new Error(`Linear GraphQL error: ${json.errors[0].message}`);
  }

  return json.data as T;
}
```

### 5.2 GraphQL Queries (`src/lib/linear/queries.ts`)

```typescript
/**
 * Fetch workflow states for a team (kanban columns).
 * Ordered by position.
 */
export const WORKFLOW_STATES_QUERY = `
  query WorkflowStates($teamKey: String!) {
    team(key: $teamKey) {  
      id
      key
      name
      states {
        nodes {
          id
          name
          type
          color
          position
        }
      }
    }
  }
`;

/**
 * Note: Linear's `team()` query takes an ID, not a key.
 * We need to resolve teamKey → teamId first.
 */
export const TEAM_BY_KEY_QUERY = `
  query TeamByKey {
    teams {
      nodes {
        id
        key
        name
      }
    }
  }
`;

/**
 * Fetch issues for a team, with optional filters.
 * Paginated — returns first 100 by default.
 */
export const TEAM_ISSUES_QUERY = `
  query TeamIssues($teamId: String!, $filter: IssueFilter, $after: String) {
    team(id: $teamId) {
      issues(
        first: 100
        after: $after
        filter: $filter
        orderBy: updatedAt
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          identifier
          title
          description
          priority
          priorityLabel
          url
          createdAt
          updatedAt
          state {
            id
            name
            type
          }
          assignee {
            id
            name
            displayName
            avatarUrl
          }
          labels {
            nodes {
              id
              name
              color
            }
          }
        }
      }
    }
  }
`;

/**
 * Fetch a single issue by identifier (e.g. "PAY-42").
 * Used when opening a thread linked to a Linear issue.
 */
export const ISSUE_BY_IDENTIFIER_QUERY = `
  query IssueByIdentifier($id: String!) {
    issueSearch(query: $id, first: 1) {
      nodes {
        id
        identifier
        title
        description
        priority
        priorityLabel
        url
        state {
          id
          name
          type
        }
        assignee {
          id
          name
          displayName
          avatarUrl
        }
      }
    }
  }
`;

/**
 * Fetch current user info (for "assigned to me" default filter).
 */
export const VIEWER_QUERY = `
  query Viewer {
    viewer {
      id
      name
      displayName
      email
      avatarUrl
    }
  }
`;

/**
 * Fetch team members (for assignee filter dropdown).
 */
export const TEAM_MEMBERS_QUERY = `
  query TeamMembers($teamId: String!) {
    team(id: $teamId) {
      members {
        nodes {
          id
          name
          displayName
          avatarUrl
          email
        }
      }
    }
  }
`;

/**
 * Fetch labels for a team (for label filter dropdown).
 */
export const TEAM_LABELS_QUERY = `
  query TeamLabels($teamId: String!) {
    team(id: $teamId) {
      labels {
        nodes {
          id
          name
          color
        }
      }
    }
  }
`;
```

### 5.3 Linear Hook (`src/components/linear/useLinear.ts`)

```typescript
import { useState, useEffect, useCallback, useRef } from 'react';
import { linearQuery } from '../../lib/linear/client';
import {
  TEAM_BY_KEY_QUERY,
  TEAM_ISSUES_QUERY,
  VIEWER_QUERY,
  TEAM_MEMBERS_QUERY,
  TEAM_LABELS_QUERY,
} from '../../lib/linear/queries';
import type {
  LinearIssue,
  LinearWorkflowState,
  LinearTeam,
  LinearUser,
  KanbanData,
  KanbanFilters,
} from '../../lib/linear/types';
import { useConfigStore } from '../../config/useConfig';

interface UseLinearReturn {
  kanbanData: KanbanData | null;
  loading: boolean;
  error: string | null;
  filters: KanbanFilters;
  setFilters: (filters: Partial<KanbanFilters>) => void;
  teamMembers: LinearUser[];
  teamLabels: Array<{ id: string; name: string; color: string }>;
  refresh: () => Promise<void>;
}

/**
 * Hook to fetch and manage Linear kanban data for a project.
 *
 * @param teamKey - Linear team key from project config (e.g. "PAY")
 */
export function useLinear(teamKey: string): UseLinearReturn {
  const config = useConfigStore((s) => s.config);

  const [kanbanData, setKanbanData] = useState<KanbanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<LinearUser[]>([]);
  const [teamLabels, setTeamLabels] = useState<Array<{ id: string; name: string; color: string }>>([]);
  const [filters, setFiltersState] = useState<KanbanFilters>({
    assigneeId: config?.user?.linearUserId ?? null, // default: "me"
    priority: null,
    labelId: null,
  });

  const teamIdRef = useRef<string | null>(null);

  const setFilters = useCallback((partial: Partial<KanbanFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...partial }));
  }, []);

  const resolveTeamId = useCallback(async (): Promise<string> => {
    if (teamIdRef.current) return teamIdRef.current;

    const data = await linearQuery<{ teams: { nodes: LinearTeam[] } }>(TEAM_BY_KEY_QUERY);
    const team = data.teams.nodes.find((t) => t.key === teamKey);
    if (!team) throw new Error(`Linear team "${teamKey}" not found`);
    teamIdRef.current = team.id;
    return team.id;
  }, [teamKey]);

  const fetchKanban = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const teamId = await resolveTeamId();

      // Build filter object for Linear API
      const issueFilter: Record<string, unknown> = {};
      if (filters.assigneeId) {
        issueFilter.assignee = { id: { eq: filters.assigneeId } };
      }
      if (filters.priority !== null) {
        issueFilter.priority = { eq: filters.priority };
      }
      if (filters.labelId) {
        issueFilter.labels = { some: { id: { eq: filters.labelId } } };
      }

      // Parallel fetch: issues + workflow states (via team) + members + labels
      const [issuesData, membersData, labelsData] = await Promise.all([
        linearQuery<{
          team: {
            id: string;
            key: string;
            name: string;
            issues: {
              nodes: LinearIssue[];
              pageInfo: { hasNextPage: boolean; endCursor: string };
            };
          };
        }>(TEAM_ISSUES_QUERY, {
          teamId,
          filter: Object.keys(issueFilter).length > 0 ? issueFilter : undefined,
        }),
        linearQuery<{ team: { members: { nodes: LinearUser[] } } }>(TEAM_MEMBERS_QUERY, { teamId }),
        linearQuery<{ team: { labels: { nodes: Array<{ id: string; name: string; color: string }> } } }>(
          TEAM_LABELS_QUERY,
          { teamId }
        ),
      ]);

      // We need workflow states separately since the issues query
      // doesn't return them at the team level. Fetch via team query.
      const statesData = await linearQuery<{
        team: { states: { nodes: LinearWorkflowState[] } };
      }>(
        `query TeamStates($teamId: String!) {
          team(id: $teamId) {
            states {
              nodes { id name type color position }
            }
          }
        }`,
        { teamId }
      );

      const states = statesData.team.states.nodes.sort((a, b) => a.position - b.position);
      const issues = issuesData.team.issues.nodes;

      // Group issues by state ID
      const issuesByState: Record<string, LinearIssue[]> = {};
      for (const state of states) {
        issuesByState[state.id] = [];
      }
      for (const issue of issues) {
        const stateId = issue.state.id;
        if (issuesByState[stateId]) {
          issuesByState[stateId].push(issue);
        }
      }

      setKanbanData({
        states,
        issuesByState,
        team: {
          id: issuesData.team.id,
          key: issuesData.team.key,
          name: issuesData.team.name,
        },
      });
      setTeamMembers(membersData.team.members.nodes);
      setTeamLabels(labelsData.team.labels.nodes);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [resolveTeamId, filters]);

  // Fetch on mount and when filters change
  useEffect(() => {
    fetchKanban();
  }, [fetchKanban]);

  return {
    kanbanData,
    loading,
    error,
    filters,
    setFilters,
    teamMembers,
    teamLabels,
    refresh: fetchKanban,
  };
}
```

---

## 6. Component Specifications

### 6.1 Sidebar (`src/components/sidebar/Sidebar.tsx`)

```
┌─────────────────────────┐
│  [Workspace Switcher ▼] │  ← WorkspaceSwitcher
│─────────────────────────│
│  + New Chat             │  ← Button, creates standalone thread
│─────────────────────────│
│  PROJECTS               │  ← Section header
│  📱 PayMe          (3)  │  ← ProjectItem (icon, name, active thread count)
│  💍 Wedding        (1)  │
│  📋 Legal Ops           │
│─────────────────────────│
│  RECENT                 │  ← Section header
│  ● Fix auth flow        │  ← RecentThreads (dot = has unread)
│  ○ Budget planning      │
│  ○ Vendor research      │
│─────────────────────────│
│                         │
│  ⚙ Settings             │  ← SidebarFooter
└─────────────────────────┘
```

**Width:** 260px default, collapsible to 48px (icons only).

**shadcn components used:**
- `ScrollArea` — wraps the project list + recent threads for overflow
- `Button` — New Chat, Settings, project items
- `Separator` — between sections
- `DropdownMenu` — workspace switcher
- `Badge` — active thread count on projects
- `Tooltip` — on collapsed sidebar, show names on hover

```tsx
// Sidebar.tsx — structure sketch
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useNavigationStore();
  const { workspaces } = useConfigStore();
  const activeWorkspaceId = useNavigationStore((s) => s.activeWorkspaceId);

  const activeWorkspace = workspaces.find((ws) => ws.id === activeWorkspaceId);

  return (
    <aside className={cn(
      'flex flex-col border-r bg-muted/40 transition-all',
      sidebarCollapsed ? 'w-12' : 'w-[260px]'
    )}>
      <WorkspaceSwitcher />
      <Separator />

      <div className="px-3 py-2">
        <Button variant="ghost" className="w-full justify-start" onClick={handleNewChat}>
          <PlusIcon className="mr-2 h-4 w-4" />
          {!sidebarCollapsed && 'New Chat'}
        </Button>
      </div>

      <Separator />

      <ScrollArea className="flex-1">
        {!sidebarCollapsed && (
          <p className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase">
            Projects
          </p>
        )}
        <ProjectList projects={activeWorkspace?.projects ?? []} />

        <Separator className="my-2" />

        {!sidebarCollapsed && (
          <p className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase">
            Recent
          </p>
        )}
        <RecentThreads />
      </ScrollArea>

      <Separator />
      <SidebarFooter />
    </aside>
  );
}
```

### 6.2 WorkspaceSwitcher (`src/components/sidebar/WorkspaceSwitcher.tsx`)

Uses `DropdownMenu` from shadcn. Shows the currently active workspace name with a chevron. Dropdown lists all workspaces from config.

```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ChevronDownIcon, CheckIcon } from 'lucide-react';

export function WorkspaceSwitcher() {
  const { workspaces } = useConfigStore();
  const { activeWorkspaceId, setActiveWorkspace } = useNavigationStore();
  const active = workspaces.find((ws) => ws.id === activeWorkspaceId);

  return (
    <div className="p-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="w-full justify-between">
            <span className="flex items-center gap-2">
              {active?.icon && <span>{active.icon}</span>}
              <span className="font-semibold">{active?.displayName ?? 'Select Workspace'}</span>
            </span>
            <ChevronDownIcon className="h-4 w-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[230px]">
          {workspaces.map((ws) => (
            <DropdownMenuItem
              key={ws.id}
              onClick={() => setActiveWorkspace(ws.id)}
            >
              <span className="flex items-center gap-2 flex-1">
                {ws.icon && <span>{ws.icon}</span>}
                {ws.displayName}
              </span>
              {ws.id === activeWorkspaceId && <CheckIcon className="h-4 w-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```

### 6.3 ProjectList + ProjectItem

```tsx
// ProjectList.tsx
export function ProjectList({ projects }: { projects: ResolvedProject[] }) {
  const { activeProjectId, setActiveProject } = useNavigationStore();
  // Get active thread counts from thread store (Track 2)
  const threadCounts = useThreadStore((s) => s.getActiveThreadCountsByProject());

  return (
    <div className="space-y-0.5 px-1">
      {projects.map((project) => (
        <ProjectItem
          key={project.id}
          project={project}
          isActive={project.id === activeProjectId}
          threadCount={threadCounts[project.id] ?? 0}
          onClick={() => setActiveProject(project.id)}
        />
      ))}
    </div>
  );
}

// ProjectItem.tsx
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function ProjectItem({
  project,
  isActive,
  threadCount,
  onClick,
}: {
  project: ResolvedProject;
  isActive: boolean;
  threadCount: number;
  onClick: () => void;
}) {
  return (
    <Button
      variant={isActive ? 'secondary' : 'ghost'}
      className="w-full justify-between h-8 px-2"
      onClick={onClick}
    >
      <span className="flex items-center gap-2 truncate">
        <span className="text-base">{project.icon ?? '📁'}</span>
        <span className="truncate text-sm">{project.displayName}</span>
      </span>
      {threadCount > 0 && (
        <Badge variant="secondary" className="ml-auto text-xs h-5 px-1.5">
          {threadCount}
        </Badge>
      )}
    </Button>
  );
}
```

### 6.4 RecentThreads (`src/components/sidebar/RecentThreads.tsx`)

Shows the 10 most recently active (non-archived) threads across all projects in the current workspace.

```tsx
export function RecentThreads() {
  const activeWorkspaceId = useNavigationStore((s) => s.activeWorkspaceId);
  const activeThreadId = useNavigationStore((s) => s.activeThreadId);
  const setActiveThread = useNavigationStore((s) => s.setActiveThread);
  const setActiveProject = useNavigationStore((s) => s.setActiveProject);

  // From Track 2 thread store — filter to current workspace's projects
  const recentThreads = useThreadStore((s) =>
    s.getRecentThreads({ workspaceId: activeWorkspaceId, limit: 10 })
  );

  return (
    <div className="space-y-0.5 px-1">
      {recentThreads.map((thread) => (
        <Button
          key={thread.id}
          variant={thread.id === activeThreadId ? 'secondary' : 'ghost'}
          className="w-full justify-start h-7 px-2 text-sm"
          onClick={() => {
            if (thread.projectId) setActiveProject(thread.projectId);
            setActiveThread(thread.id);
          }}
        >
          <span className={cn(
            'mr-2 h-1.5 w-1.5 rounded-full',
            thread.hasUnread ? 'bg-primary' : 'bg-transparent'
          )} />
          <span className="truncate">{thread.title || 'Untitled'}</span>
        </Button>
      ))}
    </div>
  );
}
```

### 6.5 ProjectView (`src/components/project/ProjectView.tsx`)

Router component — decides what to show based on the active project's skills.

```tsx
export function ProjectView() {
  const activeProjectId = useNavigationStore((s) => s.activeProjectId);
  const getProject = useConfigStore((s) => s.getProject);

  if (!activeProjectId) {
    return <EmptyState message="Select a project from the sidebar" />;
  }

  const project = getProject(activeProjectId);
  if (!project) {
    return <EmptyState message="Project not found" />;
  }

  return (
    <div className="flex flex-col h-full">
      <ProjectHeader project={project} />
      {project.hasLinear ? (
        <KanbanBoard teamKey={project.linear!.teamKey} projectId={project.id} />
      ) : (
        <ProjectThreadList projectId={project.id} />
      )}
    </div>
  );
}
```

### 6.6 ProjectHeader (`src/components/project/ProjectHeader.tsx`)

```tsx
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCwIcon } from 'lucide-react';

export function ProjectHeader({ project }: { project: ResolvedProject }) {
  const threadCount = useThreadStore((s) => s.getActiveThreadCount(project.id));

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{project.icon ?? '📁'}</span>
        <div>
          <h1 className="text-lg font-semibold">{project.displayName}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {project.skills.map((skill) => (
              <Badge key={skill} variant="outline" className="text-xs">
                {skill}
              </Badge>
            ))}
            {threadCount > 0 && (
              <span>{threadCount} active thread{threadCount !== 1 ? 's' : ''}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

### 6.7 ProjectThreadList (`src/components/project/ProjectThreadList.tsx`)

For non-Linear projects. Shows all threads belonging to this project.

```tsx
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PlusIcon } from 'lucide-react';

export function ProjectThreadList({ projectId }: { projectId: string }) {
  const threads = useThreadStore((s) => s.getThreadsByProject(projectId));
  const setActiveThread = useNavigationStore((s) => s.setActiveThread);
  const createThread = useThreadStore((s) => s.createThread);

  const handleNewThread = () => {
    const thread = createThread({ projectId });
    setActiveThread(thread.id);
  };

  return (
    <div className="flex-1 p-4 overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-muted-foreground">Threads</h2>
        <Button size="sm" variant="outline" onClick={handleNewThread}>
          <PlusIcon className="h-4 w-4 mr-1" />
          New Thread
        </Button>
      </div>

      {threads.length === 0 ? (
        <EmptyState message="No threads yet. Start a conversation!" />
      ) : (
        <div className="space-y-2">
          {threads.map((thread) => (
            <Card
              key={thread.id}
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => setActiveThread(thread.id)}
            >
              <CardHeader className="p-3">
                <CardTitle className="text-sm">{thread.title || 'Untitled'}</CardTitle>
                <CardDescription className="text-xs">
                  {formatRelativeTime(thread.updatedAt)}
                  {thread.taskRef && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      {thread.taskRef.id}
                    </Badge>
                  )}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 6.8 KanbanBoard (`src/components/linear/KanbanBoard.tsx`)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [Assignee ▼] [Priority ▼] [Label ▼]              [↻ Refresh]          │  ← KanbanFilters
│─────────────────────────────────────────────────────────────────────────│
│  Backlog(3)  │  Todo(5)     │  In Progress(2) │ In Review(1) │ Done(8) │
│ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐    │              │         │
│ │ PAY-12   │ │ │ PAY-15   │ │ │ PAY-18   │    │ ┌──────────┐ │         │
│ │ Fix login│ │ │ Add SSO  │ │ │ Refactor │    │ │ PAY-20   │ │         │
│ │ 🔴 @alex │ │ │ 🟡 @sam  │ │ │ 🟢 @alex │    │ │ Deploy v2│ │         │
│ └──────────┘ │ └──────────┘ │ └──────────┘    │ │ 🔵 @alex │ │         │
│ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐    │ └──────────┘ │         │
│ │ PAY-13   │ │ │ PAY-16   │ │ │ PAY-19   │    │              │         │
│ │ ...      │ │ │ ...      │ │ │ ...      │    │              │         │
│ └──────────┘ │ └──────────┘ │ └──────────┘    │              │         │
└──────────────────────────────────────────────────────────────────────────┘
```

```tsx
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { RefreshCwIcon } from 'lucide-react';

export function KanbanBoard({
  teamKey,
  projectId,
}: {
  teamKey: string;
  projectId: string;
}) {
  const {
    kanbanData,
    loading,
    error,
    filters,
    setFilters,
    teamMembers,
    teamLabels,
    refresh,
  } = useLinear(teamKey);

  if (error) {
    return (
      <Alert variant="destructive" className="m-4">
        <AlertDescription>
          Failed to load Linear issues: {error}
          <Button variant="link" onClick={refresh}>Retry</Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (loading && !kanbanData) {
    return <KanbanSkeleton />;
  }

  // Filter to visible columns (exclude cancelled by default)
  const visibleStates = kanbanData!.states.filter((s) => s.type !== 'cancelled');

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <KanbanFilters
        filters={filters}
        onFiltersChange={setFilters}
        teamMembers={teamMembers}
        teamLabels={teamLabels}
        onRefresh={refresh}
        loading={loading}
      />
      <ScrollArea className="flex-1">
        <div className="flex gap-4 p-4 min-w-max">
          {visibleStates.map((state) => (
            <KanbanColumn
              key={state.id}
              state={state}
              issues={kanbanData!.issuesByState[state.id] ?? []}
              projectId={projectId}
            />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}

function KanbanSkeleton() {
  return (
    <div className="flex gap-4 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="w-[280px] space-y-3">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ))}
    </div>
  );
}
```

### 6.9 KanbanColumn (`src/components/linear/KanbanColumn.tsx`)

```tsx
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

const STATE_TYPE_COLORS: Record<string, string> = {
  backlog: 'bg-gray-400',
  unstarted: 'bg-gray-500',
  started: 'bg-yellow-500',
  completed: 'bg-green-500',
  cancelled: 'bg-red-500',
};

export function KanbanColumn({
  state,
  issues,
  projectId,
}: {
  state: LinearWorkflowState;
  issues: LinearIssue[];
  projectId: string;
}) {
  return (
    <div className="flex flex-col w-[280px] shrink-0">
      <div className="flex items-center gap-2 mb-3 px-1">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: state.color }}
        />
        <h3 className="text-sm font-medium">{state.name}</h3>
        <Badge variant="secondary" className="text-xs h-5 px-1.5">
          {issues.length}
        </Badge>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-2 pr-1">
          {issues.map((issue) => (
            <IssueCard key={issue.id} issue={issue} projectId={projectId} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
```

### 6.10 IssueCard (`src/components/linear/IssueCard.tsx`)

```tsx
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

const PRIORITY_CONFIG: Record<number, { icon: string; color: string; label: string }> = {
  0: { icon: '⚪', color: 'text-gray-400', label: 'None' },
  1: { icon: '🔴', color: 'text-red-600', label: 'Urgent' },
  2: { icon: '🟠', color: 'text-orange-500', label: 'High' },
  3: { icon: '🟡', color: 'text-yellow-500', label: 'Medium' },
  4: { icon: '🔵', color: 'text-blue-400', label: 'Low' },
};

export function IssueCard({
  issue,
  projectId,
}: {
  issue: LinearIssue;
  projectId: string;
}) {
  const handleClick = useTaskThreadRouter(projectId, {
    source: 'linear',
    id: issue.identifier,
    title: issue.title,
    url: issue.url,
  });

  const priority = PRIORITY_CONFIG[issue.priority] ?? PRIORITY_CONFIG[0];

  return (
    <Card
      className="cursor-pointer hover:bg-accent/50 transition-colors"
      onClick={handleClick}
    >
      <CardHeader className="p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-muted-foreground">
            {issue.identifier}
          </span>
          <span title={priority.label}>{priority.icon}</span>
        </div>
        <CardTitle className="text-sm font-medium leading-snug">
          {issue.title}
        </CardTitle>
        <div className="flex items-center justify-between pt-1">
          <div className="flex gap-1 flex-wrap">
            {issue.labels.nodes.slice(0, 2).map((label) => (
              <Badge
                key={label.id}
                variant="outline"
                className="text-[10px] h-4 px-1"
                style={{ borderColor: label.color, color: label.color }}
              >
                {label.name}
              </Badge>
            ))}
          </div>
          {issue.assignee && (
            <Avatar className="h-5 w-5">
              <AvatarImage src={issue.assignee.avatarUrl} />
              <AvatarFallback className="text-[10px]">
                {issue.assignee.displayName.charAt(0)}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      </CardHeader>
    </Card>
  );
}
```

### 6.11 KanbanFilters (`src/components/linear/KanbanFilters.tsx`)

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RefreshCwIcon, XIcon } from 'lucide-react';

export function KanbanFilters({
  filters,
  onFiltersChange,
  teamMembers,
  teamLabels,
  onRefresh,
  loading,
}: {
  filters: KanbanFilters;
  onFiltersChange: (partial: Partial<KanbanFilters>) => void;
  teamMembers: LinearUser[];
  teamLabels: Array<{ id: string; name: string; color: string }>;
  onRefresh: () => void;
  loading: boolean;
}) {
  const hasActiveFilters = filters.assigneeId || filters.priority !== null || filters.labelId;

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b">
      {/* Assignee filter */}
      <Select
        value={filters.assigneeId ?? 'all'}
        onValueChange={(v) => onFiltersChange({ assigneeId: v === 'all' ? null : v })}
      >
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <SelectValue placeholder="Assignee" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All assignees</SelectItem>
          {teamMembers.map((m) => (
            <SelectItem key={m.id} value={m.id}>{m.displayName}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Priority filter */}
      <Select
        value={filters.priority !== null ? String(filters.priority) : 'all'}
        onValueChange={(v) => onFiltersChange({ priority: v === 'all' ? null : Number(v) })}
      >
        <SelectTrigger className="w-[140px] h-8 text-xs">
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All priorities</SelectItem>
          <SelectItem value="1">🔴 Urgent</SelectItem>
          <SelectItem value="2">🟠 High</SelectItem>
          <SelectItem value="3">🟡 Medium</SelectItem>
          <SelectItem value="4">🔵 Low</SelectItem>
          <SelectItem value="0">⚪ None</SelectItem>
        </SelectContent>
      </Select>

      {/* Label filter */}
      <Select
        value={filters.labelId ?? 'all'}
        onValueChange={(v) => onFiltersChange({ labelId: v === 'all' ? null : v })}
      >
        <SelectTrigger className="w-[140px] h-8 text-xs">
          <SelectValue placeholder="Label" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All labels</SelectItem>
          {teamLabels.map((l) => (
            <SelectItem key={l.id} value={l.id}>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
                {l.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Clear filters */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={() => onFiltersChange({ assigneeId: null, priority: null, labelId: null })}
        >
          <XIcon className="h-3 w-3 mr-1" />
          Clear
        </Button>
      )}

      {/* Spacer + Refresh */}
      <div className="flex-1" />
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={onRefresh}
        disabled={loading}
      >
        <RefreshCwIcon className={cn('h-4 w-4', loading && 'animate-spin')} />
      </Button>
    </div>
  );
}
```

---

## 7. Task → Thread Routing Logic

This is the core behavior when a user clicks a Linear issue card. The logic finds or creates a thread linked to that task.

### 7.1 Hook: `useTaskThreadRouter`

```typescript
// src/hooks/useTaskThreadRouter.ts

import { useCallback } from 'react';
import { useThreadStore } from '../stores/threadStore';
import { useNavigationStore } from '../stores/navigationStore';
import type { TaskRef } from '../config/types';
import { ISSUE_BY_IDENTIFIER_QUERY } from '../lib/linear/queries';
import { linearQuery } from '../lib/linear/client';

/**
 * Returns a click handler that:
 * 1. Searches for an existing active thread linked to this task
 * 2. If found → navigates to it
 * 3. If all threads for this task are archived → creates a new one
 * 4. If no thread exists → creates one with task context as system message
 */
export function useTaskThreadRouter(projectId: string, taskRef: TaskRef) {
  const { setActiveThread } = useNavigationStore();
  const { findThreadByTaskRef, createThread } = useThreadStore();

  return useCallback(async () => {
    // Step 1: Find existing thread(s) for this task
    const existingThreads = findThreadByTaskRef(taskRef.source, taskRef.id);

    // Step 2: Filter to active (non-archived) threads
    const activeThreads = existingThreads.filter((t) => !t.archived);

    if (activeThreads.length > 0) {
      // Navigate to the most recently updated active thread
      const latest = activeThreads.sort((a, b) => b.updatedAt - a.updatedAt)[0];
      setActiveThread(latest.id);
      return;
    }

    // Step 3: No active thread — create a new one
    const systemMessage = buildTaskSystemMessage(taskRef);
    const newThread = createThread({
      projectId,
      taskRef,
      title: `${taskRef.id}: ${taskRef.title ?? 'Untitled'}`,
      initialSystemMessage: systemMessage,
    });

    setActiveThread(newThread.id);
  }, [projectId, taskRef, setActiveThread, findThreadByTaskRef, createThread]);
}

/**
 * Build the system message injected into a new thread linked to a task.
 * Provides the AI with context about what the user is working on.
 */
function buildTaskSystemMessage(taskRef: TaskRef): string {
  return [
    `The user is working on a task from ${taskRef.source}.`,
    `Task: ${taskRef.id}${taskRef.title ? ` — ${taskRef.title}` : ''}`,
    taskRef.url ? `URL: ${taskRef.url}` : '',
    '',
    'Help them with this task. Ask what they need if their first message is ambiguous.',
  ]
    .filter(Boolean)
    .join('\n');
}
```

### 7.2 Thread Store Extensions (added to Track 2 store)

```typescript
// Extensions to the Track 2 thread store

interface ThreadStoreExtensions {
  /**
   * Find all threads linked to a specific task ref.
   * Searches by source + id pair.
   */
  findThreadByTaskRef: (source: string, id: string) => ThreadDescriptor[];

  /**
   * Get all threads belonging to a specific project.
   * Sorted by updatedAt descending. Excludes archived by default.
   */
  getThreadsByProject: (projectId: string, includeArchived?: boolean) => ThreadDescriptor[];

  /**
   * Get count of active (non-archived) threads per project.
   * Returns Record<projectId, count>.
   */
  getActiveThreadCountsByProject: () => Record<string, number>;

  /**
   * Get count of active threads for one project.
   */
  getActiveThreadCount: (projectId: string) => number;

  /**
   * Get recent threads across projects in a workspace.
   */
  getRecentThreads: (opts: {
    workspaceId: string | null;
    limit?: number;
  }) => ThreadDescriptor[];

  /**
   * Create a thread with optional project + task ref + initial system message.
   */
  createThread: (opts: {
    projectId?: string;
    taskRef?: TaskRef;
    title?: string;
    initialSystemMessage?: string;
  }) => ThreadDescriptor;
}
```

### 7.3 Routing Flow Diagram

```
User clicks IssueCard (PAY-42)
         │
         ▼
findThreadByTaskRef("linear", "PAY-42")
         │
         ├── Found active threads? ──── YES ──→ Navigate to most recent
         │
         NO
         │
         ▼
createThread({
  projectId: "payme",
  taskRef: { source: "linear", id: "PAY-42", title: "Fix login bug", url: "..." },
  title: "PAY-42: Fix login bug",
  initialSystemMessage: "The user is working on a task from linear.\nTask: PAY-42 — Fix login bug\n..."
})
         │
         ▼
Navigate to new thread
```

---

## 8. App Layout Integration

### 8.1 Root Layout

The main app layout combines the sidebar with the content area (from Track 2).

```tsx
// src/App.tsx (updated from Track 1/2)

export function App() {
  const { config, loadConfig, loading: configLoading } = useConfigStore();
  const { activeWorkspaceId, setActiveWorkspace } = useNavigationStore();

  // Load config on mount
  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Auto-select first workspace if none persisted
  useEffect(() => {
    if (config && !activeWorkspaceId) {
      const firstWs = Object.keys(config.workspaces)[0];
      if (firstWs) setActiveWorkspace(firstWs);
    }
  }, [config, activeWorkspaceId, setActiveWorkspace]);

  if (configLoading) {
    return <FullScreenLoader />;
  }

  if (!config) {
    return <SetupWizard />; // Future: guide user to create ~/.kos/config.json
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 flex overflow-hidden">
        <ContentArea />
      </main>
    </div>
  );
}
```

### 8.2 ContentArea

```tsx
// src/components/ContentArea.tsx

export function ContentArea() {
  const activeProjectId = useNavigationStore((s) => s.activeProjectId);
  const activeThreadId = useNavigationStore((s) => s.activeThreadId);

  // Thread takes priority over project view
  if (activeThreadId) {
    return <ThreadView threadId={activeThreadId} />; // From Track 2
  }

  if (activeProjectId) {
    return <ProjectView />;
  }

  return <WelcomeScreen />;
}
```

---

## 9. Initialization Sequence

```
1. Electron main process starts
2. registerConfigIPC() — register IPC handlers
3. Renderer loads React app
4. App component mounts
5. useConfigStore.loadConfig() → IPC call → reads ~/.kos/config.json
6. Config parsed → resolveConfig() → ResolvedWorkspace[] populated
7. Check persisted navigationStore → restore activeWorkspaceId
8. If no workspace persisted → auto-select first workspace
9. Sidebar renders with workspace projects
10. User clicks project → setActiveProject()
    a. If hasLinear → KanbanBoard mounts → useLinear(teamKey) fetches issues
    b. If !hasLinear → ProjectThreadList mounts → shows project threads
11. User clicks issue card → useTaskThreadRouter fires
    a. Find/create thread → navigate to thread
12. ThreadView mounts (Track 2) → user starts chatting
```

---

## 10. Error Handling

| Scenario | Behavior |
|----------|----------|
| `~/.kos/config.json` missing | Show setup wizard / empty state with instructions |
| Config JSON parse error | Show error banner with file path + raw error message |
| `LINEAR_API_KEY` missing | Show inline message in KanbanBoard: "Add LINEAR_API_KEY to config" |
| Linear API returns 401 | Show "Invalid API key" error with link to Linear settings |
| Linear API network error | Show retry button in KanbanBoard, preserve last-fetched data |
| Team key not found | Show "Team {KEY} not found in Linear" with list of available teams |
| No projects in workspace | Show empty state: "No projects configured for this workspace" |

---

## 11. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+B` | Toggle sidebar |
| `Cmd+K` | Quick-open (project or thread search) — future track placeholder |
| `Cmd+N` | New standalone thread |
| `Cmd+1-9` | Switch to project 1-9 in sidebar |

Wire these via `useEffect` + `keydown` listener at the App level. Use a `useHotkeys` utility:

```typescript
// src/hooks/useHotkeys.ts
export function useHotkeys(keymap: Record<string, () => void>) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = [
        e.metaKey && 'Cmd',
        e.ctrlKey && 'Ctrl',
        e.shiftKey && 'Shift',
        e.key.toUpperCase(),
      ]
        .filter(Boolean)
        .join('+');

      if (keymap[key]) {
        e.preventDefault();
        keymap[key]();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [keymap]);
}
```

---

## 12. Styling & Theming

- Sidebar background: `bg-muted/40` (subtle differentiation from content area)
- Kanban columns: No background, separated by visual gap (4-unit spacing)
- Issue cards: shadcn `Card` with `hover:bg-accent/50` transition
- Priority colors: Emoji-based (🔴🟠🟡🔵⚪) — no color-blind accessibility issue since they're supplementary to labels
- State column dots: Use Linear's native `color` field from workflow state
- Collapsed sidebar: 48px wide, shows only icons with tooltips
- Animation: sidebar collapse uses `transition-all duration-200`
- The entire app uses shadcn's theme tokens — supports light/dark mode from Track 1

---

## 13. Data Flow Summary

```
~/.kos/config.json
       │
       ▼ (IPC: kos:config:load)
useConfigStore ──→ ResolvedWorkspace[] ──→ Sidebar
       │                                      │
       │                                      ▼
       │                              useNavigationStore
       │                             (activeWorkspace, activeProject)
       │                                      │
       ▼                                      ▼
  LINEAR_API_KEY ──→ linearQuery() ──→ useLinear() ──→ KanbanBoard
                                                           │
                                                           ▼
                                                    IssueCard click
                                                           │
                                                           ▼
                                               useTaskThreadRouter()
                                                           │
                                                           ▼
                                                  useThreadStore
                                              (find/create thread)
                                                           │
                                                           ▼
                                                  ThreadView (Track 2)
```

---

## 14. Testing Strategy

### Unit Tests
- `resolveConfig()` — config parsing with various shapes (missing fields, extra fields)
- `buildTaskSystemMessage()` — correct message formatting
- `findThreadByTaskRef()` — finds matching threads, handles archived correctly
- `KanbanFilters` type construction — filter object building for Linear API

### Integration Tests
- Config IPC round-trip (main → renderer → main)
- Linear API mock — verify correct GraphQL queries are sent for different filter states
- Task-thread routing — verify find-or-create logic with mock thread store

### Component Tests (React Testing Library)
- `Sidebar` — renders projects for active workspace, switches workspace
- `KanbanBoard` — renders columns and cards from mock data
- `IssueCard` — displays identifier, title, priority, assignee
- `WorkspaceSwitcher` — lists workspaces, highlights active
- `ProjectView` — routes to kanban vs thread list based on project skills

---

## 15. Scope Boundaries

### In Scope (This Track)
- Config loading via IPC
- Workspace switching + persistence
- Sidebar navigation (projects, recent threads)
- Project view routing (kanban vs thread list)
- Linear kanban board (read-only: fetch and display issues)
- Issue card → thread creation/navigation
- Basic keyboard shortcuts

### Out of Scope (Future Tracks)
- Drag-and-drop issue reordering / state changes on the kanban
- Linear issue creation from kOS
- Linear webhook subscriptions (real-time updates)
- Notion integration UI
- Settings UI (config editing)
- Quick-open command palette (Cmd+K)
- Sidebar customization (reorder, hide projects)
- Multi-select issues
- Issue detail panel (full description, comments, activity)
- Offline/cached mode for Linear data
