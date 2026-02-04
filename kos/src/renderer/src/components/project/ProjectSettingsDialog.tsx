import { FolderOpen, Loader2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Project } from "../../types";
import { useProjectStore } from "../../stores/project-store";
import { useSettingsStore } from "../../stores/settings-store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
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
import { Separator } from "../ui/separator";
import { IconPicker } from "./IconPicker";
import { LinearTeamPicker } from "./LinearTeamPicker";
import { RepoListEditor } from "./RepoListEditor";

interface ProjectSettingsDialogProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProjectSettingsDialog({ project, open, onOpenChange }: ProjectSettingsDialogProps) {
  const updateProject = useProjectStore((s) => s.updateProject);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const refreshRepositories = useProjectStore((s) => s.refreshRepositories);
  const isInitialized = useSettingsStore((s) => s.isInitialized);
  const initialize = useSettingsStore((s) => s.initialize);

  const [name, setName] = useState(project.name);
  const [icon, setIcon] = useState(project.icon || "folder");
  const [linearTeamId, setLinearTeamId] = useState<string | undefined>(project.linearTeamId);
  const [workspacePath, setWorkspacePath] = useState(project.workspacePath || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingFolder, setIsChangingFolder] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize settings store
  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [isInitialized, initialize]);

  // Reset form when project changes
  useEffect(() => {
    setName(project.name);
    setIcon(project.icon || "folder");
    setLinearTeamId(project.linearTeamId);
    setWorkspacePath(project.workspacePath || "");
    setHasChanges(false);
  }, [project]);

  // Track changes
  useEffect(() => {
    const changed =
      name !== project.name ||
      icon !== (project.icon || "folder") ||
      linearTeamId !== project.linearTeamId ||
      workspacePath !== (project.workspacePath || "");
    setHasChanges(changed);
  }, [name, icon, linearTeamId, workspacePath, project]);

  const handleChangeFolder = useCallback(async () => {
    const result = await window.api.openDirectoryDialog();
    if (result.canceled || !result.filePaths[0]) return;

    const path = result.filePaths[0];
    setWorkspacePath(path);
    setIsChangingFolder(true);

    try {
      // Save the new workspace path
      await updateProject(project.id, { workspacePath: path });
      // Refresh repositories from new path
      await refreshRepositories(project.id);
    } finally {
      setIsChangingFolder(false);
    }
  }, [project.id, updateProject, refreshRepositories]);

  const handleSave = useCallback(async () => {
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      await updateProject(project.id, {
        name: name.trim(),
        icon,
        linearTeamId,
        workspacePath: workspacePath || undefined,
      });
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  }, [name, icon, linearTeamId, workspacePath, project.id, updateProject, onOpenChange]);

  const handleDelete = useCallback(async () => {
    await deleteProject(project.id);
    setDeleteDialogOpen(false);
    onOpenChange(false);
  }, [project.id, deleteProject, onOpenChange]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Project Settings</DialogTitle>
            <DialogDescription>
              Configure {project.name} settings and repositories.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Workspace folder */}
            <div className="space-y-2">
              <Label>Workspace Folder</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleChangeFolder}
                  disabled={isChangingFolder}
                  className="flex-1 justify-start font-normal"
                >
                  {isChangingFolder ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FolderOpen className="mr-2 h-4 w-4" />
                  )}
                  {workspacePath
                    ? workspacePath.split("/").slice(-2).join("/")
                    : "Select folder..."}
                </Button>
              </div>
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

            <Separator />

            {/* Repositories (read-only, auto-discovered) */}
            <div className="space-y-2">
              <Label>Repositories</Label>
              <p className="text-xs text-muted-foreground">Auto-discovered from workspace folder</p>
              <RepoListEditor
                projectId={project.id}
                repositories={project.repositories}
                workspacePath={project.workspacePath}
              />
            </div>

            <Separator />

            {/* Danger zone */}
            <div className="space-y-2">
              <Label className="text-destructive">Danger Zone</Label>
              <Button
                variant="outline"
                className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Project
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!name.trim() || isSaving || !hasChanges}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{project.name}"? This will remove the project
              configuration but won't delete the repositories from disk.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
