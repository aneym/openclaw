/**
 * EmptyTerminalPane
 *
 * Shown when a terminal panel has no terminal started yet.
 * Displays type switcher (to change panel type before starting) and a button to start the terminal.
 */

import { Keyboard, Play, FolderOpen } from "lucide-react";
import { useCallback, useState, useMemo } from "react";
import { usePanelStore } from "../../stores/panel-store";
import { useProjectStore } from "../../stores/project-store";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { Button } from "../ui/button";
import { PanelTypeSwitcher } from "./PanelTypeSwitcher";

interface EmptyTerminalPaneProps {
  workspaceId: string;
  panelId: string;
  tabId?: string;
  cwd?: string;
}

export function EmptyTerminalPane({ workspaceId, panelId, tabId, cwd }: EmptyTerminalPaneProps) {
  const startTerminalTab = usePanelStore((s) => s.startTerminalTab);

  // Get workspace and project for default cwd
  const workspacesMap = useWorkspaceStore((s) => s.workspaces);
  const projectsMap = useProjectStore((s) => s.projects);
  const workspace = useMemo(() => workspacesMap.get(workspaceId), [workspacesMap, workspaceId]);
  const project = useMemo(
    () => (workspace?.projectId ? projectsMap.get(workspace.projectId) : undefined),
    [projectsMap, workspace?.projectId],
  );

  // Default cwd: prop > workspace.path > project.workspacePath > undefined (homedir)
  const defaultCwd = cwd || workspace?.path || project?.workspacePath;
  const [selectedCwd, setSelectedCwd] = useState(defaultCwd);

  const handleStartTerminal = useCallback(() => {
    if (!tabId) return;
    startTerminalTab(workspaceId, panelId, tabId, selectedCwd);
  }, [workspaceId, panelId, tabId, selectedCwd, startTerminalTab]);

  const handleSelectDirectory = useCallback(async () => {
    try {
      const result = await window.api.openDirectoryDialog();
      if (!result.canceled && result.filePaths[0]) {
        setSelectedCwd(result.filePaths[0]);
      }
    } catch (err) {
      console.error("[EmptyTerminalPane] Failed to open directory dialog:", err);
    }
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Type switcher - allows changing panel type before starting terminal */}
      <div className="shrink-0 border-b border-border/50 px-3 py-1.5 bg-muted/30">
        <PanelTypeSwitcher workspaceId={workspaceId} panelId={panelId} currentType="terminal" />
      </div>

      {/* Start terminal prompt */}
      <div className="flex-1 flex flex-col items-center justify-center bg-background text-muted-foreground gap-4">
        <Keyboard className="h-12 w-12 text-muted-foreground/40" />
        <p className="text-sm">New Terminal</p>

        {selectedCwd && (
          <p className="text-xs text-muted-foreground/60 flex items-center gap-1">
            <FolderOpen className="h-3 w-3" />
            {selectedCwd}
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSelectDirectory}>
            <FolderOpen className="h-4 w-4 mr-1" />
            Choose Directory
          </Button>
          <Button size="sm" onClick={handleStartTerminal}>
            <Play className="h-4 w-4 mr-1" />
            Start Terminal
          </Button>
        </div>
      </div>
    </div>
  );
}
