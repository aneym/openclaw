export interface Workspace {
  id: string
  name: string // "Work", "Personal"
  icon?: string // emoji or URL
  projects: string[] // project IDs
  gatewayUrl: string // ws://localhost:18789
  gatewayToken?: string
  linearApiKey?: string
  createdAt: number
}

export interface WorkspaceConfig {
  activeWorkspaceId: string
  workspaces: Workspace[]
}
