export interface RepoConfig {
  id: string;
  path: string; // Absolute local path
  name?: string; // Display name (auto: dir name)
  remoteUrl?: string; // Git remote URL (auto-detected)
  defaultBranch?: string; // main/master (auto-detected)
  isMainRepo?: boolean; // First repo is "main"
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  commit: string;
  isMain: boolean;
  isPrunable: boolean;
}

export interface Project {
  id: string;
  profileId?: string; // Profile this project belongs to (undefined = all profiles)
  name: string;
  icon?: string; // Emoji or Lucide icon key
  color?: string; // Hex color for accent
  linearTeamId?: string; // Linear team ID
  workspacePath?: string; // Root folder for auto-discovered repos
  repositories: RepoConfig[]; // Auto-populated from workspacePath scan
  createdAt: number;
  updatedAt: number;
}
