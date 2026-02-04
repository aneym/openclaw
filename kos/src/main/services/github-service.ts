import { getGitHubConfig } from "./config-storage";

// Types
export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  cloneUrl: string;
  sshUrl: string;
  private: boolean;
  defaultBranch: string;
}

export interface GitHubValidationResult {
  valid: boolean;
  username?: string;
  error?: string;
}

// GitHub API base URL
const GITHUB_API = "https://api.github.com";

// Helper for GitHub API requests
async function githubFetch<T>(endpoint: string, token: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${GITHUB_API}${endpoint}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub API error: ${response.status} - ${error}`);
  }

  return response.json() as Promise<T>;
}

// Validate a GitHub token
export async function validateToken(token: string): Promise<GitHubValidationResult> {
  try {
    const user = await githubFetch<{ login: string }>("/user", token);
    return {
      valid: true,
      username: user.login,
    };
  } catch (err) {
    const error = err as Error;
    return {
      valid: false,
      error: error.message,
    };
  }
}

// List user's repositories
export async function listUserRepos(token?: string): Promise<GitHubRepo[]> {
  const actualToken = token ?? getGitHubConfig()?.token;
  if (!actualToken) {
    throw new Error("GitHub not connected");
  }

  interface GitHubApiRepo {
    id: number;
    name: string;
    full_name: string;
    clone_url: string;
    ssh_url: string;
    private: boolean;
    default_branch: string;
  }

  // Get user's repos (includes private repos they have access to)
  const repos = await githubFetch<GitHubApiRepo[]>(
    "/user/repos?per_page=100&sort=updated&direction=desc",
    actualToken,
  );

  return repos.map((repo) => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    cloneUrl: repo.clone_url,
    sshUrl: repo.ssh_url,
    private: repo.private,
    defaultBranch: repo.default_branch,
  }));
}

// Search repositories
export async function searchRepos(query: string, token?: string): Promise<GitHubRepo[]> {
  const actualToken = token ?? getGitHubConfig()?.token;
  if (!actualToken) {
    throw new Error("GitHub not connected");
  }

  interface GitHubSearchResult {
    items: Array<{
      id: number;
      name: string;
      full_name: string;
      clone_url: string;
      ssh_url: string;
      private: boolean;
      default_branch: string;
    }>;
  }

  // Search for repos (this searches public repos by default)
  // Adding user:<username> to query would restrict to user's repos
  const result = await githubFetch<GitHubSearchResult>(
    `/search/repositories?q=${encodeURIComponent(query)}&per_page=20&sort=updated`,
    actualToken,
  );

  return result.items.map((repo) => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    cloneUrl: repo.clone_url,
    sshUrl: repo.ssh_url,
    private: repo.private,
    defaultBranch: repo.default_branch,
  }));
}
