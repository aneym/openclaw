export interface Task {
  id: string;
  workspaceId: string;
  source: TaskSource;
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

export type TaskSource = "linear" | "local";

export type TaskStatus = "backlog" | "todo" | "in_progress" | "in_review" | "done" | "cancelled";

export const TASK_STATUS_ORDER: TaskStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "cancelled",
];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
  cancelled: "Cancelled",
};

export const TASK_PRIORITY_LABELS: Record<number, string> = {
  0: "No priority",
  1: "Urgent",
  2: "High",
  3: "Medium",
  4: "Low",
};
