import { ipcMain } from "electron";
import { validateToken, listUserRepos, searchRepos } from "../services/github-service";

export function registerGitHubIpc(): void {
  ipcMain.handle("github:validate", (_, token: string) => {
    return validateToken(token);
  });

  ipcMain.handle("github:listRepos", () => {
    return listUserRepos();
  });

  ipcMain.handle("github:searchRepos", (_, query: string) => {
    return searchRepos(query);
  });
}
