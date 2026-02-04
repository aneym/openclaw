export interface Chat {
  id: string;
  workspaceId?: string; // chats can optionally belong to workspaces
  projectId?: string; // direct project assignment (for dashboard)
  sessionKey: string; // OpenClaw session key
  title: string;
  subtitle?: string; // e.g. "KOS-7: UI Layout"
  linkedTaskId?: string; // optional task link
  channel?: string; // source channel (slack, telegram, discord, etc.)
  status: ChatStatus;
  lastMessageAt: number;
  createdAt: number;
}

export type ChatStatus = "active" | "idle" | "archived";
