import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// ~/.kos/ base directory
const KOS_DIR = join(homedir(), ".kos");

// File paths
const GLOBAL_CONFIG_PATH = join(KOS_DIR, "config.json");
const GITHUB_CONFIG_PATH = join(KOS_DIR, "github.json");
const LINEAR_CONFIG_PATH = join(KOS_DIR, "linear.json");

// Types
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

// Default config
const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  version: 1,
  defaultGatewayUrl: "ws://localhost:18789",
  theme: "system",
  sidebarWidth: 280,
};

// Ensure ~/.kos/ directory exists
function ensureKosDir(): void {
  if (!existsSync(KOS_DIR)) {
    mkdirSync(KOS_DIR, { recursive: true });
  }
}

// Generic JSON read/write helpers
function readJsonFile<T>(path: string): T | null {
  try {
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJsonFile<T>(path: string, data: T): void {
  ensureKosDir();
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}

function deleteFile(path: string): void {
  try {
    if (existsSync(path)) {
      unlinkSync(path);
    }
  } catch {
    // Ignore errors
  }
}

// Global config operations
export function getGlobalConfig(): GlobalConfig {
  const config = readJsonFile<GlobalConfig>(GLOBAL_CONFIG_PATH);
  return config ?? DEFAULT_GLOBAL_CONFIG;
}

export function saveGlobalConfig(config: GlobalConfig): void {
  writeJsonFile(GLOBAL_CONFIG_PATH, config);
}

// GitHub credentials
export function getGitHubConfig(): GitHubConfig | null {
  return readJsonFile<GitHubConfig>(GITHUB_CONFIG_PATH);
}

export function saveGitHubConfig(config: GitHubConfig): void {
  writeJsonFile(GITHUB_CONFIG_PATH, config);
}

export function clearGitHubConfig(): void {
  deleteFile(GITHUB_CONFIG_PATH);
}

// Linear credentials
export function getLinearConfig(): LinearConfig | null {
  return readJsonFile<LinearConfig>(LINEAR_CONFIG_PATH);
}

export function saveLinearConfig(config: LinearConfig): void {
  writeJsonFile(LINEAR_CONFIG_PATH, config);
}

export function clearLinearConfig(): void {
  deleteFile(LINEAR_CONFIG_PATH);
}

// Get the kOS directory path (for use in other services)
export function getKosDir(): string {
  ensureKosDir();
  return KOS_DIR;
}
