# SPEC: kOS Project Navigation + Linear Board (Track 3)

> **Covers:** KOS-2 (Linear Integration), KOS-4 (Task Lifecycle)
> **Depends on:** Track 1 (scaffold + types), Track 2 (panel engine)
> **Directory:** `kos/src/renderer/src/`

## Goal

Build the project navigation sidebar and Linear kanban board panel. Users see their projects in the sidebar, click one to see its Linear board, and click a task to open (or create) a thread for that task. The dependency graph from Linear drives task sequencing.

## Project Navigation (Sidebar Enhancement)

### Components

```
src/renderer/src/components/nav/
├── ProjectList.tsx           # List of projects in sidebar
├── ProjectItem.tsx           # Single project row with expand/collapse
├── ProjectSettings.tsx       # Project config (Linear team, repo path, skills)
└── WorkspaceSwitcher.tsx     # Switch between workspaces (top of sidebar)
```

### Sidebar Layout (extends Track 2)

```
┌──────────────────────┐
│ ◉ Work      ▾        │  ← WorkspaceSwitcher (dropdown)
├──────────────────────┤
│ 🔍 Search...         │  ← ThreadSearch (from Track 2)
├──────────────────────┤
│ ▸ PayMe Backend   5  │  ← ProjectItem (5 = thread count)
│ ▾ kOS             3  │  ← Expanded project
│   ● UI Layout        │  ← Active thread
│   ○ Data model       │
│   ○ Chat system      │
│ ▸ Relay           2  │
│ ▸ Personal        1  │
├──────────────────────┤
│ ○ Quick question     │  ← Unsorted threads
├──────────────────────┤
│ [+ New Thread]       │
└──────────────────────┘
```

### WorkspaceSwitcher.tsx

Dropdown at top of sidebar:
- Shows active workspace name + icon
- Click → dropdown with all workspaces
- Each workspace item shows name + project count
- Switching workspace reloads projects + threads from that workspace's gateway

### ProjectItem.tsx

- Click project name → expands to show threads (already in Track 2)
- Click project icon/name area → also sets this project's Linear board as the main view (if no active thread)
- Badge with thread count
- Right-click → Project Settings

### ProjectSettings.tsx

Modal or drawer:
- Project name + icon + color
- Linear team connection (dropdown of available teams from Linear API)
- Repo path (file picker via Electron dialog)
- Enabled skills (checklist)
- Archive project

## Linear Board Panel

### Components

```
src/renderer/src/components/linear/
├── LinearBoard.tsx           # Kanban board (main panel component)
├── LinearColumn.tsx          # Single status column
├── LinearCard.tsx            # Task card in the board
├── LinearCardDetail.tsx      # Expanded task detail (optional overlay)
├── DependencyBadge.tsx       # Shows blocked/blocks status
└── hooks/
    ├── useLinearTeam.ts      # Fetch team issues via Linear GraphQL
    ├── useLinearIssue.ts     # Fetch single issue
    └── useDependencyGraph.ts # Build + query the DAG
```

### LinearBoard.tsx

Kanban board with columns for each Linear state:

```
┌─────────┬─────────┬──────────┬──────────┬────────┐
│ Backlog │  Todo   │ In Prog  │  Review  │  Done  │
├─────────┼─────────┼──────────┼──────────┼────────┤
│         │         │          │          │        │
│ [Card]  │ [Card]  │ [Card]   │ [Card]   │ [Card] │
│ [Card]  │         │ [Card]   │          │        │
│ [Card]  │         │          │          │        │
│         │         │          │          │        │
└─────────┴─────────┴──────────┴──────────┴────────┘
```

- Horizontal scroll if columns overflow
- Each column header shows count
- Cards are sorted by priority (urgent first) then by dependency graph depth (tasks that unblock the most come first)
- Drag-and-drop between columns → updates Linear state via API

### LinearCard.tsx

```
┌─────────────────────────┐
│ KOS-7                 ⚡ │  ← identifier + priority icon
│ UI Layout & Navigation  │  ← title
│ ⛔ Blocked by KOS-1     │  ← DependencyBadge (if blocked)
│ 🔽 Blocks 2 tasks       │  ← downstream impact
│ 👤 Alex     🏷 UI/UX    │  ← assignee + label
└─────────────────────────┘
```

- Click card → open/create thread for this task
- Visual treatment for blocked tasks: reduced opacity (0.5), "⛔ Blocked" badge
- Priority indicators: 🔴 Urgent, 🟠 High, 🟡 Medium, ⚪ Low
- If task has a linked thread with streaming status → green dot

### Task → Thread Routing

When a card is clicked:

```ts
function handleCardClick(issue: LinearIssue) {
  // Check if a thread already exists for this issue
  const existing = threadStore.findByLinearIssue(issue.id);
  
  if (existing) {
    // Activate existing thread
    threadStore.setActiveThread(existing.id);
    return;
  }
  
  // Create new thread linked to this issue
  const session = await gateway.request('session.create', {
    label: `${issue.identifier}: ${issue.title}`,
  });
  
  threadStore.addThread({
    id: generateId(),
    sessionKey: session.sessionKey,
    title: `${issue.identifier}: ${issue.title}`,
    subtitle: issue.identifier,
    linearIssueId: issue.id,
    projectId: currentProject.id,
    status: 'active',
    lastMessageAt: Date.now(),
    createdAt: Date.now(),
  });
}
```

## Dependency Graph

### useDependencyGraph.ts

Build the DAG from Linear's `blocks` relations:

```ts
interface DependencyGraph {
  // Adjacency lists
  blocks: Map<string, Set<string>>;        // issueId → Set<issues it blocks>
  blockedBy: Map<string, Set<string>>;     // issueId → Set<issues blocking it>
  
  // Queries
  isBlocked(issueId: string): boolean;
  getBlockers(issueId: string): string[];
  getBlocked(issueId: string): string[];
  getUnblockedTasks(): LinearIssue[];
  getCriticalPath(): LinearIssue[];
  getDownstreamCount(issueId: string): number;
  topologicalSort(): string[];
}

function buildDependencyGraph(issues: LinearIssue[]): DependencyGraph {
  const blocks = new Map<string, Set<string>>();
  const blockedBy = new Map<string, Set<string>>();
  
  for (const issue of issues) {
    for (const relation of issue.relations) {
      if (relation.type === 'blocks') {
        // issue blocks relation.relatedIssueId
        getOrCreate(blocks, issue.id).add(relation.relatedIssueId);
        getOrCreate(blockedBy, relation.relatedIssueId).add(issue.id);
      }
    }
  }
  
  return {
    blocks,
    blockedBy,
    isBlocked: (id) => {
      const deps = blockedBy.get(id);
      if (!deps) return false;
      // Blocked only if ANY blocker is not Done
      return [...deps].some(depId => {
        const dep = issues.find(i => i.id === depId);
        return dep && dep.state.name !== 'Done';
      });
    },
    getUnblockedTasks: () => {
      return issues.filter(i => 
        i.state.name !== 'Done' && !graph.isBlocked(i.id)
      );
    },
    getDownstreamCount: (id) => {
      // BFS/DFS count of all transitively blocked tasks
      const visited = new Set<string>();
      const queue = [id];
      while (queue.length) {
        const current = queue.shift()!;
        for (const blocked of blocks.get(current) ?? []) {
          if (!visited.has(blocked)) {
            visited.add(blocked);
            queue.push(blocked);
          }
        }
      }
      return visited.size;
    },
    getCriticalPath: () => {
      // Longest path through the DAG (most blocking chain)
      // ... topological sort + dynamic programming
    },
    topologicalSort: () => { /* Kahn's algorithm */ },
  };
}
```

### DependencyBadge.tsx

Shows on blocked cards:
- `⛔ Blocked by KOS-1, KOS-4` (red text, links to blocker cards)
- `🔽 Blocks 3 tasks` (shows downstream impact count)
- Hover on "Blocks 3 tasks" → tooltip listing the blocked tasks

## Linear GraphQL Client

### useLinearTeam.ts

```ts
const LINEAR_API = 'https://api.linear.app/graphql';

async function fetchTeamIssues(teamId: string, apiKey: string): Promise<LinearIssue[]> {
  const query = `{
    team(id: "${teamId}") {
      issues(first: 250) {
        nodes {
          id
          identifier
          title
          description
          priority
          state { id name color type }
          assignee { id name displayName avatarUrl }
          labels { nodes { id name color } }
          relations {
            nodes {
              type
              relatedIssue { id identifier title state { name } }
            }
          }
        }
      }
      states {
        nodes { id name color position type }
      }
    }
  }`;
  
  // ... fetch + cache (react-query or SWR)
}
```

Cache strategy:
- Initial fetch on project select
- Background refetch every 60 seconds
- Optimistic updates on drag-and-drop (update local state immediately, sync to Linear)

### Linear Issue Type

```ts
interface LinearIssue {
  id: string;
  identifier: string;           // "KOS-7"
  title: string;
  description?: string;
  priority: number;             // 0=none, 1=urgent, 2=high, 3=medium, 4=low
  state: LinearState;
  assignee?: LinearUser;
  labels: LinearLabel[];
  relations: LinearRelation[];
  // Computed
  isBlocked?: boolean;
  downstreamCount?: number;
}

interface LinearState {
  id: string;
  name: string;
  color: string;
  position: number;
  type: 'backlog' | 'unstarted' | 'started' | 'completed' | 'cancelled';
}

interface LinearRelation {
  type: 'blocks' | 'is_blocked_by' | 'related' | 'duplicate';
  relatedIssue: {
    id: string;
    identifier: string;
    title: string;
    state: { name: string };
  };
}
```

## Linear API Key Management

Users provide their own Linear API key:
- Stored in workspace config (Zustand persist → localStorage)
- Set via Project Settings or first-time setup
- Validated on entry (try fetching viewer info)
- Never sent to our servers — stays local

## Acceptance Criteria

1. Sidebar shows projects with expand/collapse
2. Workspace switcher dropdown works
3. Click project (with Linear team linked) → Linear board appears in main area
4. Board shows columns for each Linear state
5. Cards show identifier, title, priority, assignee, labels
6. Blocked cards show `⛔ Blocked` badge with reduced opacity
7. Cards show downstream impact count
8. Click card → creates or activates thread for that task
9. Drag card between columns → updates Linear state (optimistic + API call)
10. Board refreshes in background (60s interval)
11. Unblocked tasks sorted higher within each column
12. Works with the KOS Linear team data (17 issues, 19 block relations)

## Do NOT

- Do not implement webhooks (polling only for v1)
- Do not implement issue creation from kOS (use Linear directly)
- Do not implement issue detail editing (just viewing + status changes)
- Do not implement cycle/project views (team board only)
- Do not implement multi-team view (one team per project)
- Do not build the Notion→Linear pipeline (KOS-3, later)
