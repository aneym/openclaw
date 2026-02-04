import { ipcMain } from "electron";
import {
  listProjects,
  getProject,
  saveProject,
  deleteProject,
  generateProjectId,
  type Project,
} from "../services/project-storage";

export function registerProjectIpc(): void {
  ipcMain.handle("projects:list", () => {
    return listProjects();
  });

  ipcMain.handle("projects:get", (_, id: string) => {
    return getProject(id);
  });

  ipcMain.handle("projects:save", (_, project: Project) => {
    saveProject(project);
  });

  ipcMain.handle("projects:delete", (_, id: string) => {
    deleteProject(id);
  });

  ipcMain.handle("projects:generateId", () => {
    return generateProjectId();
  });
}
