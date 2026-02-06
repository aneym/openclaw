import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// Dev uses ~/.kos-dev/, prod uses ~/.kos/ — fully isolated instances
const KOS_DIR = join(homedir(), app.isPackaged ? ".kos" : ".kos-dev");

// File paths
const GLOBAL_CONFIG_PATH = join(KOS_DIR, "config.json");
const GITHUB_CONFIG_PATH = join(KOS_DIR, "github.json");
const LINEAR_CONFIG_PATH = join(KOS_DIR, "linear.json");
const THEMES_CONFIG_PATH = join(KOS_DIR, "themes.json");

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

// Theme types (duplicated from renderer — main process can't import renderer types)
export interface ThemeDefinition {
  id: string;
  name: string;
  source?: string;
  isBuiltIn: boolean;
  cssVars: {
    theme?: Record<string, string>;
    light: Record<string, string>;
    dark: Record<string, string>;
  };
  installedAt: number;
}

export interface ThemesConfig {
  version: 1;
  themes: ThemeDefinition[];
  activeThemeId: string;
  mode: "light" | "dark" | "system";
  liquidGlass?: boolean;
  glass?: { chromeTint?: number; sidebarTint?: number; borderOpacity?: number };
}

const DEFAULT_THEMES_CONFIG: ThemesConfig = {
  version: 1,
  themes: [],
  activeThemeId: "palantir",
  mode: "dark",
};

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

// Themes config
export function getThemesConfig(): ThemesConfig {
  const config = readJsonFile<ThemesConfig>(THEMES_CONFIG_PATH);
  return config ?? DEFAULT_THEMES_CONFIG;
}

export function saveThemesConfig(config: ThemesConfig): void {
  writeJsonFile(THEMES_CONFIG_PATH, config);
}

// Get the kOS directory path (for use in other services)
export function getKosDir(): string {
  ensureKosDir();
  return KOS_DIR;
}
