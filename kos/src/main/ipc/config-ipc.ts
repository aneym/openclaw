import { ipcMain } from "electron";
import {
  getGlobalConfig,
  saveGlobalConfig,
  getGitHubConfig,
  saveGitHubConfig,
  clearGitHubConfig,
  getLinearConfig,
  saveLinearConfig,
  clearLinearConfig,
  getThemesConfig,
  saveThemesConfig,
  type GlobalConfig,
  type GitHubConfig,
  type LinearConfig,
  type ThemesConfig,
} from "../services/config-storage";

export function registerConfigIpc(): void {
  // Global config
  ipcMain.handle("config:getGlobal", () => {
    return getGlobalConfig();
  });

  ipcMain.handle("config:saveGlobal", (_, config: GlobalConfig) => {
    saveGlobalConfig(config);
  });

  // GitHub config
  ipcMain.handle("config:getGitHub", () => {
    return getGitHubConfig();
  });

  ipcMain.handle("config:saveGitHub", (_, config: GitHubConfig) => {
    saveGitHubConfig(config);
  });

  ipcMain.handle("config:clearGitHub", () => {
    clearGitHubConfig();
  });

  // Linear config
  ipcMain.handle("config:getLinear", () => {
    return getLinearConfig();
  });

  ipcMain.handle("config:saveLinear", (_, config: LinearConfig) => {
    saveLinearConfig(config);
  });

  ipcMain.handle("config:clearLinear", () => {
    clearLinearConfig();
  });

  // Themes config
  ipcMain.on("config:getThemesSync", (event) => {
    event.returnValue = getThemesConfig();
  });

  ipcMain.handle("config:getThemes", () => {
    return getThemesConfig();
  });

  ipcMain.handle("config:saveThemes", (_, config: ThemesConfig) => {
    saveThemesConfig(config);
  });
}
