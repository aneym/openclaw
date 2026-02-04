export interface GlobalConfig {
  version: 1;
  defaultGatewayUrl: string;
  theme: "light" | "dark" | "system";
  sidebarWidth: number;
}

export interface GitHubConfig {
  token: string;
  username: string;
  validatedAt: number;
}

export interface LinearConfig {
  apiKey: string;
  userId: string;
  userName: string;
  validatedAt: number;
}

export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  cloneUrl: string;
  sshUrl: string;
  private: boolean;
  defaultBranch: string;
}

export interface RepoInfo {
  remoteUrl?: string;
  defaultBranch?: string;
  currentBranch?: string;
}

export interface RepoStatus {
  ahead: number;
  behind: number;
  dirty: boolean;
}

export interface BranchList {
  local: string[];
  remote: string[];
}

export interface PullPushResult {
  success: boolean;
  error?: string;
}
