export type TabType = "home" | "project";

export interface Tab {
  id: string;
  workspaceId: string;
  type: TabType;
  title: string;
  icon?: string;
  projectId?: string;
  isPinned: boolean;
  lastActiveAt: number;
}
