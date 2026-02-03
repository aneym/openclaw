export interface Project {
  id: string;
  name: string;
  icon?: string; // emoji
  color?: string; // hex for tab
  linearTeamId?: string; // null = use local tasks
  repositoryPath?: string; // null = non-code project
  createdAt: number;
}
