import { registerConfigIpc } from "./config-ipc";
import { registerGitIpc } from "./git-ipc";
import { registerGitHubIpc } from "./github-ipc";
import { registerLinearIpc } from "./linear-ipc";
import { registerProjectIpc } from "./project-ipc";
import { registerTerminalIpc, cleanupTerminals } from "./terminal-ipc";

// Register all IPC handlers
export function registerAllIpc(): void {
  registerConfigIpc();
  registerProjectIpc();
  registerGitIpc();
  registerGitHubIpc();
  registerLinearIpc();
  registerTerminalIpc();
}

// Cleanup function for app quit
export { cleanupTerminals };
