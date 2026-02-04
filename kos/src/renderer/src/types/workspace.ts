export interface Workspace {
  id: string;
  projectId: string;
  name: string; // "main", "feat/auth"
  path?: string; // git worktree path (code projects)
  branch?: string; // git branch name
  isDefault: boolean; // true for "main" workspace
  createdAt: number;
  // Gateway connection configuration
  gatewayUrl?: string; // WebSocket URL (e.g. "ws://localhost:18789")
  gatewayToken?: string; // Auth token for gateway
}
