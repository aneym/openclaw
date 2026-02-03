export interface Chat {
  id: string;
  workspaceId: string; // chats belong to workspaces
  sessionKey: string; // OpenClaw session key
  title: string;
  subtitle?: string; // e.g. "KOS-7: UI Layout"
  linkedTaskId?: string; // optional task link
  status: ChatStatus;
  lastMessageAt: number;
  createdAt: number;
}

export type ChatStatus = "active" | "idle" | "archived";
