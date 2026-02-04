import { ipcMain, BrowserWindow } from "electron";
import {
  isGitRepo,
  getRepoInfo,
  listWorktrees,
  createWorktree,
  removeWorktree,
  listBranches,
  getRepoStatus,
  pull,
  push,
  clone,
  getRepoDisplayName,
  scanForGitRepos,
} from "../services/git-service";

export function registerGitIpc(): void {
  ipcMain.handle("git:isRepo", (_, path: string) => {
    return isGitRepo(path);
  });

  ipcMain.handle("git:getRepoInfo", (_, path: string) => {
    return getRepoInfo(path);
  });

  ipcMain.handle("git:listWorktrees", (_, path: string) => {
    return listWorktrees(path);
  });

  ipcMain.handle(
    "git:createWorktree",
    (_, repoPath: string, branch: string, targetPath: string) => {
      createWorktree(repoPath, branch, targetPath);
    },
  );

  ipcMain.handle("git:removeWorktree", (_, path: string) => {
    removeWorktree(path);
  });

  ipcMain.handle("git:listBranches", (_, path: string) => {
    return listBranches(path);
  });

  ipcMain.handle("git:getStatus", (_, path: string) => {
    return getRepoStatus(path);
  });

  ipcMain.handle("git:pull", (_, path: string) => {
    return pull(path);
  });

  ipcMain.handle("git:push", (_, path: string) => {
    return push(path);
  });

  ipcMain.handle("git:clone", async (event, url: string, targetPath: string) => {
    // Send progress events to the renderer
    const win = BrowserWindow.fromWebContents(event.sender);
    await clone(url, targetPath, (message) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send("git:clone-progress", message);
      }
    });
  });

  ipcMain.handle("git:getDisplayName", (_, path: string) => {
    return getRepoDisplayName(path);
  });

  ipcMain.handle("git:scanForRepos", (_, rootPath: string, maxDepth?: number) => {
    return scanForGitRepos(rootPath, maxDepth);
  });
}
