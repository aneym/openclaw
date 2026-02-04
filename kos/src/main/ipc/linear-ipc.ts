import { ipcMain } from "electron";
import {
  validateApiKey,
  listTeams,
  getTeamIssues,
  updateIssueState,
} from "../services/linear-service";

export function registerLinearIpc(): void {
  ipcMain.handle("linear:validate", (_, apiKey: string) => {
    return validateApiKey(apiKey);
  });

  ipcMain.handle("linear:listTeams", () => {
    return listTeams();
  });

  ipcMain.handle("linear:getTeamIssues", (_, teamId: string) => {
    return getTeamIssues(teamId);
  });

  ipcMain.handle("linear:updateIssueState", (_, issueId: string, stateId: string) => {
    return updateIssueState(issueId, stateId);
  });
}
