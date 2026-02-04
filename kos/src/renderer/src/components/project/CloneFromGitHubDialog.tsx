import { FolderOpen, Loader2, Lock, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { GitHubRepo } from "../../types";
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
import { ScrollArea } from "../ui/scroll-area";

interface CloneFromGitHubDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClone: (repo: GitHubRepo, targetPath: string) => Promise<void>;
}

export function CloneFromGitHubDialog({ open, onOpenChange, onClone }: CloneFromGitHubDialogProps) {
  const isGitHubConnected = useSettingsStore((s) => s.isGitHubConnected)();

  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [targetPath, setTargetPath] = useState("");
  const [isCloning, setIsCloning] = useState(false);
  const [cloneProgress, setCloneProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load repos when dialog opens
  useEffect(() => {
    if (open && isGitHubConnected) {
      setIsLoading(true);
      window.api.github
        .listRepos()
        .then(setRepos)
        .catch((err) => setError(err.message))
        .finally(() => setIsLoading(false));
    }
  }, [open, isGitHubConnected]);

  // Listen for clone progress
  useEffect(() => {
    if (!isCloning) return;
    const unsubscribe = window.api.git.onCloneProgress((message) => {
      setCloneProgress(message);
    });
    return unsubscribe;
  }, [isCloning]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedRepo(null);
      setTargetPath("");
      setCloneProgress(null);
      setError(null);
    }
  }, [open]);

  const filteredRepos = repos.filter(
    (repo) =>
      repo.name.toLowerCase().includes(search.toLowerCase()) ||
      repo.fullName.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSelectPath = useCallback(async () => {
    const result = await window.api.openDirectoryDialog();
    if (!result.canceled && result.filePaths[0]) {
      setTargetPath(result.filePaths[0]);
    }
  }, []);

  const handleClone = useCallback(async () => {
    if (!selectedRepo || !targetPath) return;

    setIsCloning(true);
    setError(null);

    try {
      const fullPath = `${targetPath}/${selectedRepo.name}`;
      await onClone(selectedRepo, fullPath);
      onOpenChange(false);
    } catch (err) {
      const error = err as Error;
      setError(error.message);
    } finally {
      setIsCloning(false);
      setCloneProgress(null);
    }
  }, [selectedRepo, targetPath, onClone, onOpenChange]);

  if (!isGitHubConnected) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clone from GitHub</DialogTitle>
            <DialogDescription>
              Connect your GitHub account in Settings to clone repositories.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Clone from GitHub</DialogTitle>
          <DialogDescription>Select a repository to clone into your project.</DialogDescription>
        </DialogHeader>

        {!selectedRepo ? (
          // Repository selection
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search repositories..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ScrollArea className="h-64">
                <div className="space-y-1">
                  {filteredRepos.map((repo) => (
                    <button
                      key={repo.id}
                      onClick={() => setSelectedRepo(repo)}
                      className="w-full text-left px-3 py-2 rounded-md hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{repo.name}</span>
                        {repo.private && <Lock className="h-3 w-3 text-muted-foreground" />}
                      </div>
                      <div className="text-xs text-muted-foreground">{repo.fullName}</div>
                    </button>
                  ))}
                  {filteredRepos.length === 0 && !isLoading && (
                    <div className="text-center py-8 text-muted-foreground">
                      No repositories found
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </div>
        ) : (
          // Clone configuration
          <div className="space-y-4">
            <div className="p-3 rounded-lg border border-border bg-muted/20">
              <div className="font-medium">{selectedRepo.name}</div>
              <div className="text-xs text-muted-foreground">{selectedRepo.fullName}</div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Clone to</label>
              <div className="flex gap-2">
                <Input
                  value={targetPath}
                  onChange={(e) => setTargetPath(e.target.value)}
                  placeholder="/path/to/directory"
                  className="flex-1"
                />
                <Button variant="outline" onClick={handleSelectPath}>
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
              {targetPath && (
                <div className="text-xs text-muted-foreground">
                  Will clone to: {targetPath}/{selectedRepo.name}
                </div>
              )}
            </div>

            {cloneProgress && (
              <div className="text-xs text-muted-foreground font-mono p-2 bg-muted rounded">
                {cloneProgress}
              </div>
            )}

            {error && <div className="text-sm text-destructive">{error}</div>}
          </div>
        )}

        <DialogFooter>
          {selectedRepo ? (
            <>
              <Button variant="outline" onClick={() => setSelectedRepo(null)} disabled={isCloning}>
                Back
              </Button>
              <Button onClick={handleClone} disabled={!targetPath || isCloning}>
                {isCloning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Clone
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
