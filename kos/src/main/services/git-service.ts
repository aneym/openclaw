import { execSync, spawn } from "child_process";
import { Dirent, existsSync, readdirSync } from "fs";
import { basename, join } from "path";

// Types
export interface RepoInfo {
  remoteUrl?: string;
  defaultBranch?: string;
  currentBranch?: string;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  commit: string;
  isMain: boolean;
  isPrunable: boolean;
}

export interface BranchList {
  local: string[];
  remote: string[];
}

export interface RepoStatus {
  ahead: number;
  behind: number;
  dirty: boolean;
}

export interface PullPushResult {
  success: boolean;
  error?: string;
}

// Helper to run git commands
function runGit(args: string[], cwd: string): string {
  try {
    return execSync(`git ${args.join(" ")}`, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    const error = err as { stderr?: string; message?: string };
    throw new Error(error.stderr || error.message || "Git command failed");
  }
}

// Check if a path is a git repository
export function isGitRepo(path: string): boolean {
  if (!existsSync(path)) return false;

  try {
    runGit(["rev-parse", "--git-dir"], path);
    return true;
  } catch {
    return false;
  }
}

// Get repository info (remote URL, branches)
export function getRepoInfo(path: string): RepoInfo {
  if (!isGitRepo(path)) {
    return {};
  }

  const info: RepoInfo = {};

  // Get remote URL
  try {
    info.remoteUrl = runGit(["config", "--get", "remote.origin.url"], path);
  } catch {
    // No remote configured
  }

  // Get default branch
  try {
    // Try to get the remote HEAD
    const remoteHead = runGit(["symbolic-ref", "refs/remotes/origin/HEAD"], path);
    info.defaultBranch = remoteHead.replace("refs/remotes/origin/", "");
  } catch {
    // Fallback to checking common branch names
    try {
      const branches = runGit(["branch", "-a"], path);
      if (branches.includes("main")) {
        info.defaultBranch = "main";
      } else if (branches.includes("master")) {
        info.defaultBranch = "master";
      }
    } catch {
      // Ignore
    }
  }

  // Get current branch
  try {
    info.currentBranch = runGit(["branch", "--show-current"], path);
  } catch {
    // Detached HEAD or other state
  }

  return info;
}

// List worktrees for a repository
export function listWorktrees(repoPath: string): WorktreeInfo[] {
  if (!isGitRepo(repoPath)) {
    return [];
  }

  try {
    const output = runGit(["worktree", "list", "--porcelain"], repoPath);
    const worktrees: WorktreeInfo[] = [];
    let current: Partial<WorktreeInfo> = {};

    for (const line of output.split("\n")) {
      if (line.startsWith("worktree ")) {
        if (current.path) {
          worktrees.push(current as WorktreeInfo);
        }
        current = { path: line.slice(9), isMain: false, isPrunable: false };
      } else if (line.startsWith("HEAD ")) {
        current.commit = line.slice(5);
      } else if (line.startsWith("branch ")) {
        current.branch = line.slice(7).replace("refs/heads/", "");
      } else if (line === "bare") {
        current.isMain = true;
      } else if (line === "prunable") {
        current.isPrunable = true;
      } else if (line === "") {
        // Empty line marks end of worktree entry
      }
    }

    // Add the last worktree
    if (current.path) {
      // The first worktree is the main one
      if (worktrees.length === 0) {
        current.isMain = true;
      }
      worktrees.push(current as WorktreeInfo);
    }

    return worktrees;
  } catch {
    return [];
  }
}

// Create a new worktree
export function createWorktree(repoPath: string, branch: string, targetPath: string): void {
  if (!isGitRepo(repoPath)) {
    throw new Error("Not a git repository");
  }

  // Check if branch exists
  try {
    runGit(["rev-parse", "--verify", branch], repoPath);
    // Branch exists, create worktree for it
    runGit(["worktree", "add", targetPath, branch], repoPath);
  } catch {
    // Branch doesn't exist, create new branch
    runGit(["worktree", "add", "-b", branch, targetPath], repoPath);
  }
}

// Remove a worktree
export function removeWorktree(worktreePath: string): void {
  // Find the main repo from the worktree
  const gitDir = join(worktreePath, ".git");
  if (!existsSync(gitDir)) {
    throw new Error("Not a valid worktree path");
  }

  // Run from the worktree's parent directory
  execSync(`git worktree remove "${worktreePath}"`, {
    cwd: worktreePath,
    encoding: "utf-8",
  });
}

// List branches
export function listBranches(repoPath: string): BranchList {
  if (!isGitRepo(repoPath)) {
    return { local: [], remote: [] };
  }

  const result: BranchList = { local: [], remote: [] };

  try {
    const localOutput = runGit(["branch", "--format=%(refname:short)"], repoPath);
    result.local = localOutput.split("\n").filter(Boolean);
  } catch {
    // Ignore
  }

  try {
    const remoteOutput = runGit(["branch", "-r", "--format=%(refname:short)"], repoPath);
    result.remote = remoteOutput
      .split("\n")
      .filter(Boolean)
      .map((b) => b.replace("origin/", ""))
      .filter((b) => b !== "HEAD");
  } catch {
    // Ignore
  }

  return result;
}

// Get repository status (ahead/behind, dirty)
export function getRepoStatus(repoPath: string): RepoStatus {
  const status: RepoStatus = { ahead: 0, behind: 0, dirty: false };

  if (!isGitRepo(repoPath)) {
    return status;
  }

  try {
    // Check for uncommitted changes
    const dirtyCheck = runGit(["status", "--porcelain"], repoPath);
    status.dirty = dirtyCheck.length > 0;
  } catch {
    // Ignore
  }

  try {
    // Get ahead/behind counts
    const currentBranch = runGit(["branch", "--show-current"], repoPath);
    if (currentBranch) {
      const tracking = runGit(
        ["rev-list", "--left-right", "--count", `${currentBranch}...origin/${currentBranch}`],
        repoPath,
      );
      const [ahead, behind] = tracking.split("\t").map(Number);
      status.ahead = ahead || 0;
      status.behind = behind || 0;
    }
  } catch {
    // No tracking branch or other issue
  }

  return status;
}

// Pull changes
export function pull(repoPath: string): PullPushResult {
  if (!isGitRepo(repoPath)) {
    return { success: false, error: "Not a git repository" };
  }

  try {
    runGit(["pull"], repoPath);
    return { success: true };
  } catch (err) {
    const error = err as Error;
    return { success: false, error: error.message };
  }
}

// Push changes
export function push(repoPath: string): PullPushResult {
  if (!isGitRepo(repoPath)) {
    return { success: false, error: "Not a git repository" };
  }

  try {
    runGit(["push"], repoPath);
    return { success: true };
  } catch (err) {
    const error = err as Error;
    return { success: false, error: error.message };
  }
}

// Clone a repository (with progress callback via events)
export function clone(
  url: string,
  targetPath: string,
  onProgress?: (message: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ["clone", "--progress", url, targetPath];
    const proc = spawn("git", args);

    let stderr = "";

    proc.stderr.on("data", (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      if (onProgress) {
        // Git progress messages come on stderr
        onProgress(text.trim());
      }
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Clone failed: ${stderr}`));
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

// Get display name for a repo path
export function getRepoDisplayName(path: string): string {
  return basename(path);
}

// Discovered repository info
export interface DiscoveredRepo {
  path: string;
  name: string;
  remoteUrl?: string;
  defaultBranch?: string;
}

// Folders to skip during recursive scan
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "vendor",
  "Pods",
  ".bundle",
  "build",
  "dist",
  ".next",
  ".nuxt",
  ".output",
  "__pycache__",
  ".venv",
  "venv",
]);

// Scan a directory recursively for git repositories
export function scanForGitRepos(rootPath: string, maxDepth = 3): DiscoveredRepo[] {
  const discovered: DiscoveredRepo[] = [];

  function scan(currentPath: string, depth: number): void {
    if (depth > maxDepth) return;

    // Check if current directory is a git repo
    const gitPath = join(currentPath, ".git");
    if (existsSync(gitPath)) {
      const info = getRepoInfo(currentPath);
      discovered.push({
        path: currentPath,
        name: basename(currentPath),
        remoteUrl: info.remoteUrl,
        defaultBranch: info.defaultBranch,
      });
      // Don't recurse into git repos (they may have nested repos, but that's rare)
      return;
    }

    // Read directory entries
    let entries: Dirent[];
    try {
      entries = readdirSync(currentPath, { withFileTypes: true });
    } catch {
      // Permission denied or other error
      return;
    }

    // Recurse into subdirectories
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      // Skip hidden directories (except at root level for depth 0)
      if (entry.name.startsWith(".") && depth > 0) continue;

      // Skip known non-repo directories
      if (SKIP_DIRS.has(entry.name)) continue;

      scan(join(currentPath, entry.name), depth + 1);
    }
  }

  scan(rootPath, 0);
  return discovered;
}
