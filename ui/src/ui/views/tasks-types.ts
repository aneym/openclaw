export type Project = {
  id: string;
  name: string;
  slug: string;
  agent: string | null;
  description: string | null;
  color: string | null;
  created_at: number;
  updated_at: number;
};

export type TaskStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "blocked"
  | "review"
  | "done"
  | "cancelled";
export type TaskPriority = "none" | "low" | "medium" | "high" | "urgent";

export type Task = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigned_to: string | null;
  created_by: string | null;
  sort_order: number;
  labels: string; // JSON array
  due_date: number | null;
  metadata: string; // JSON object
  created_at: number;
  updated_at: number;
};

export type TaskComment = {
  id: string;
  task_id: string;
  author: string;
  body: string;
  created_at: number;
};

export type NewTask = {
  project_id: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigned_to?: string;
  created_by?: string;
  sort_order?: number;
  labels?: string[];
  due_date?: number;
  metadata?: Record<string, unknown>;
};

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
  onTaskReorder: (id: string, status: TaskStatus, sortOrder: number) => void;
  onTaskDelete: (id: string) => void;
  onRefresh: () => void;
};
