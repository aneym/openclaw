# SPEC: Tasks & Kanban Board

## Overview

Add a universal project management system to OpenClaw with a Kanban board view in the web UI. Tasks are stored in SQLite, exposed via HTTP API, and rendered as a new "Tasks" tab in the control UI.

## Architecture

### Storage: SQLite (`~/.openclaw/tasks.db`)

WAL mode for concurrent access. ULID-based IDs.

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,          -- ULID
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,    -- url-safe, e.g. "job-hunt"
  agent TEXT,                   -- agent id, nullable
  description TEXT,
  color TEXT,                   -- hex color for UI
  created_at INTEGER NOT NULL,  -- epoch ms
  updated_at INTEGER NOT NULL
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,           -- ULID
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'backlog'
    CHECK(status IN ('backlog','todo','in_progress','blocked','review','done','cancelled')),
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK(priority IN ('none','low','medium','high','urgent')),
  assigned_to TEXT,              -- agent name or "alex"
  created_by TEXT,               -- who created it
  sort_order REAL NOT NULL DEFAULT 0,  -- fractional for kanban reorder
  labels TEXT DEFAULT '[]',      -- JSON array of strings
  due_date INTEGER,              -- epoch ms, nullable
  metadata TEXT DEFAULT '{}',    -- JSON blob
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE task_comments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX idx_tasks_sort ON tasks(project_id, status, sort_order);
```

### Backend: HTTP API in Gateway

New file: `src/gateway/tasks-http.ts`

All routes under `/api/tasks/`. Gateway auth required (same as coding-sessions).

```
GET    /api/tasks/projects                    → list projects
POST   /api/tasks/projects                    → create project
PATCH  /api/tasks/projects/:id                → update project
DELETE /api/tasks/projects/:id                → delete project

GET    /api/tasks?project=<slug>&status=<s>   → list tasks (filterable)
POST   /api/tasks                             → create task
GET    /api/tasks/:id                         → get task + comments
PATCH  /api/tasks/:id                         → update task (status, title, etc.)
PATCH  /api/tasks/:id/reorder                 → update sort_order (kanban drag)
DELETE /api/tasks/:id                         → delete task

POST   /api/tasks/:id/comments                → add comment
```

Request/response is JSON. Standard error format: `{ error: string }`.

### Frontend: New "Tasks" Tab

Add to navigation.ts:

- Tab: `"tasks"`
- Path: `/tasks`
- Group: "Control" (between sessions and usage)
- Icon: `checkSquare` (or similar from existing icons)

#### Kanban View (`views/tasks.ts`)

Pure render function following existing patterns:

```typescript
export type TasksProps = {
  basePath: string;
  loading: boolean;
  projects: Project[];
  tasks: Task[];
  selectedProject: string | null; // project slug
  error: string | null;
  onProjectSelect: (slug: string | null) => void;
  onTaskCreate: (task: NewTask) => void;
  onTaskUpdate: (id: string, patch: Partial<Task>) => void;
  onTaskReorder: (id: string, status: string, sortOrder: number) => void;
  onTaskDelete: (id: string) => void;
  onRefresh: () => void;
};
```

Layout:

- Top bar: project selector dropdown + "New Task" button + refresh
- Kanban columns: backlog | todo | in_progress | blocked | review | done
- Each column: header with count, scrollable task cards
- Cards: title, priority badge, assignee chip, labels
- Drag-drop between columns changes status + sort_order
- Click card → expand inline with description, comments, edit form

Drag-drop implementation: Use native HTML5 drag-and-drop (no library dependency needed for Lit).

#### Styles

Use existing CSS variable system (`var(--c-bg-2)`, `var(--c-text-1)`, etc.) from the control UI theme. Add task-specific styles in `styles/tasks.css` or inline in the view.

## State Management in app.ts

Add to ClawdApp:

```typescript
// State
@state() tasksProjects: Project[] = [];
@state() tasksList: Task[] = [];
@state() tasksSelectedProject: string | null = null;
@state() tasksLoading = false;
@state() tasksError: string | null = null;

// Methods
async loadTasksProjects() { ... }
async loadTasks(projectSlug?: string) { ... }
async createTask(task: NewTask) { ... }
async updateTask(id: string, patch: Partial<Task>) { ... }
async reorderTask(id: string, status: string, sortOrder: number) { ... }
async deleteTask(id: string) { ... }
```

Load data when switching to tasks tab (same pattern as cron/sessions views).

## File Changes Summary

### New files:

1. `src/gateway/tasks-http.ts` — HTTP API handlers + SQLite setup
2. `ui/src/ui/views/tasks.ts` — Kanban view render function
3. `ui/src/ui/views/tasks-types.ts` — TypeScript types for tasks/projects

### Modified files:

1. `src/gateway/server-http.ts` — Wire up `handleTasksHttpRequest`
2. `ui/src/ui/navigation.ts` — Add "tasks" tab
3. `ui/src/ui/app.ts` — Add state, methods, render case
4. `ui/src/ui/app-render.ts` — Add renderTasks call
5. `ui/src/styles.css` — Add kanban styles (or separate file)

### Dependencies:

- `node:sqlite` (Node.js built-in, already used by memory system — see `src/memory/sqlite.ts`)
- No new UI dependencies needed (native drag-drop)

## Kanban Drag-Drop Spec

When a card is dropped in a new column or position:

1. Determine target status from column
2. Calculate new sort_order: midpoint between neighbors (fractional indexing)
3. PATCH `/api/tasks/:id/reorder` with `{ status, sort_order }`
4. Optimistically update UI, rollback on error

## Status Columns

| Status      | Label       | Color             |
| ----------- | ----------- | ----------------- |
| backlog     | Backlog     | gray              |
| todo        | To Do       | blue              |
| in_progress | In Progress | yellow            |
| blocked     | Blocked     | red               |
| review      | Review      | purple            |
| done        | Done        | green             |
| cancelled   | Cancelled   | hidden by default |

## Non-Goals (v1)

- Task dependencies
- Time tracking
- Recurring tasks
- Cross-agent real-time sync (polling is fine)
- Mobile-optimized layout
- Keyboard shortcuts for kanban
