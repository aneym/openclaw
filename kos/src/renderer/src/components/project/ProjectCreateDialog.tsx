import { FolderOpen, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useProjectStore } from "../../stores/project-store";
import { useSettingsStore } from "../../stores/settings-store";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { IconPicker } from "./IconPicker";
import { LinearTeamPicker } from "./LinearTeamPicker";

interface ProjectCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProjectCreateDialog({ open, onOpenChange }: ProjectCreateDialogProps) {
  const createProject = useProjectStore((s) => s.createProject);
  const isInitialized = useSettingsStore((s) => s.isInitialized);
  const initialize = useSettingsStore((s) => s.initialize);

  const [name, setName] = useState("");
  const [icon, setIcon] = useState("folder");
  const [linearTeamId, setLinearTeamId] = useState<string | undefined>();
  const [workspacePath, setWorkspacePath] = useState("");
  const [discoveredRepoCount, setDiscoveredRepoCount] = useState<number | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Initialize settings store to check for connections
  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [isInitialized, initialize]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setName("");
      setIcon("folder");
      setLinearTeamId(undefined);
      setWorkspacePath("");
      setDiscoveredRepoCount(null);
    }
  }, [open]);

  const handleSelectFolder = useCallback(async () => {
    const result = await window.api.openDirectoryDialog();
    if (result.canceled || !result.filePaths[0]) return;

    const path = result.filePaths[0];
    setWorkspacePath(path);
    setIsScanning(true);
    setDiscoveredRepoCount(null);

    try {
      const repos = await window.api.git.scanForRepos(path);
      setDiscoveredRepoCount(repos.length);

      // Auto-fill project name from folder name if empty
      if (!name) {
        const folderName = path.split("/").pop() || "";
        setName(folderName);
      }
    } finally {
      setIsScanning(false);
    }
  }, [name]);

  const handleCreate = useCallback(async () => {
    if (!name.trim() || !workspacePath) return;

    setIsCreating(true);
    try {
      await createProject({
        name: name.trim(),
        icon,
        linearTeamId,
        workspacePath,
      });
      onOpenChange(false);
    } finally {
      setIsCreating(false);
    }
  }, [name, icon, linearTeamId, workspacePath, createProject, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Project</DialogTitle>
          <DialogDescription>
            Select a workspace folder to auto-discover git repositories.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Workspace folder */}
          <div className="space-y-2">
            <Label>Workspace Folder</Label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleSelectFolder}
                disabled={isScanning}
                className="flex-1 justify-start font-normal"
              >
                {isScanning ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FolderOpen className="mr-2 h-4 w-4" />
                )}
                {workspacePath ? workspacePath.split("/").slice(-2).join("/") : "Select folder..."}
              </Button>
            </div>
            {discoveredRepoCount !== null && (
              <p className="text-sm text-muted-foreground">
                Found {discoveredRepoCount} git{" "}
                {discoveredRepoCount === 1 ? "repository" : "repositories"}
              </p>
            )}
          </div>

          {/* Name and icon */}
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <Label className="text-xs text-muted-foreground">Icon</Label>
              <div className="mt-2">
                <IconPicker value={icon} onChange={setIcon} />
              </div>
            </div>
            <div className="flex-1 space-y-2">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Project"
              />
            </div>
          </div>

          {/* Linear team */}
          <div className="space-y-2">
            <Label>Linear Team</Label>
            <LinearTeamPicker value={linearTeamId} onChange={setLinearTeamId} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || !workspacePath || isCreating}>
            {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
