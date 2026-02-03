export interface Thread {
  id: string;
  tabId?: string; // owning tab (home if unset)
  projectId?: string; // null = unsorted
  sessionKey: string; // OpenClaw session key
  title: string;
  subtitle?: string; // e.g. "KOS-7: UI Layout"
  linearIssueId?: string; // linked Linear issue
  panelLayoutId?: string; // persisted panel layout
  status: ThreadStatus;
  lastMessageAt: number;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export type ThreadStatus = "active" | "idle" | "archived";
