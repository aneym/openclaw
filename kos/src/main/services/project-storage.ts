import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { getKosDir } from "./config-storage";

// Types
export interface RepoConfig {
  id: string;
  path: string; // Absolute local path
  name?: string; // Display name (auto: dir name)
  remoteUrl?: string; // Git remote URL (auto-detected)
  defaultBranch?: string; // main/master (auto-detected)
  isMainRepo?: boolean; // First repo is "main"
}

export interface Project {
  id: string;
  name: string;
  icon?: string; // Emoji or Lucide icon key
  color?: string; // Hex color for accent
  linearTeamId?: string; // Linear team ID
  repositories: RepoConfig[];
  createdAt: number;
  updatedAt: number;
}

interface ProjectConfigFile {
  version: 1;
  project: Omit<Project, "id">;
}

// Get projects directory path
function getProjectsDir(): string {
  const kosDir = getKosDir();
  const projectsDir = join(kosDir, "projects");
  if (!existsSync(projectsDir)) {
    mkdirSync(projectsDir, { recursive: true });
  }
  return projectsDir;
}

// Get project directory path
function getProjectDir(projectId: string): string {
  return join(getProjectsDir(), projectId);
}

// Get project config file path
function getProjectConfigPath(projectId: string): string {
  return join(getProjectDir(projectId), "config.json");
}

// List all projects
export function listProjects(): Project[] {
  const projectsDir = getProjectsDir();

  try {
    const entries = readdirSync(projectsDir, { withFileTypes: true });
    const projects: Project[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const projectId = entry.name;
      const configPath = getProjectConfigPath(projectId);

      if (!existsSync(configPath)) continue;

      try {
        const raw = readFileSync(configPath, "utf-8");
        const configFile = JSON.parse(raw) as ProjectConfigFile;
        projects.push({
          id: projectId,
          ...configFile.project,
        });
      } catch {
        // Skip invalid project configs
        continue;
      }
    }

    return projects.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

// Get a single project
export function getProject(id: string): Project | null {
  const configPath = getProjectConfigPath(id);

  if (!existsSync(configPath)) return null;

  try {
    const raw = readFileSync(configPath, "utf-8");
    const configFile = JSON.parse(raw) as ProjectConfigFile;
    return {
      id,
      ...configFile.project,
    };
  } catch {
    return null;
  }
}

// Save a project (create or update)
export function saveProject(project: Project): void {
  const projectDir = getProjectDir(project.id);
  const configPath = getProjectConfigPath(project.id);

  // Ensure project directory exists
  if (!existsSync(projectDir)) {
    mkdirSync(projectDir, { recursive: true });
  }

  // Extract id from project for storage
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, ...projectData } = project;

  const configFile: ProjectConfigFile = {
    version: 1,
    project: projectData,
  };

  writeFileSync(configPath, JSON.stringify(configFile, null, 2), "utf-8");
}

// Delete a project
export function deleteProject(id: string): void {
  const projectDir = getProjectDir(id);

  if (existsSync(projectDir)) {
    rmSync(projectDir, { recursive: true, force: true });
  }
}

// Generate a new project ID
export function generateProjectId(): string {
  return `proj-${randomUUID().slice(0, 8)}`;
}
