export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  icon?: string;                   // emoji
  color?: string;                  // hex
  linearTeamId?: string;           // Linear team for this project
  repoPath?: string;               // local git repo path
  skills: string[];                // enabled skill IDs
  threadIds: string[];             // threads in this project
  createdAt: number;
}
