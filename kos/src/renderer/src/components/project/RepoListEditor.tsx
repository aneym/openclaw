import { Loader2, RefreshCw } from "lucide-react";
import { useCallback, useState } from "react";
import type { RepoConfig } from "../../types";
import { useProjectStore } from "../../stores/project-store";
import { Button } from "../ui/button";
import { RepoCard } from "./RepoCard";

interface RepoListEditorProps {
  projectId: string;
  repositories: RepoConfig[];
  workspacePath?: string;
}

export function RepoListEditor({ projectId, repositories, workspacePath }: RepoListEditorProps) {
  const refreshRepositories = useProjectStore((s) => s.refreshRepositories);
  const refreshRepoStatus = useProjectStore((s) => s.refreshRepoStatus);
  const repoStatuses = useProjectStore((s) => s.repoStatuses);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!workspacePath) return;
    setIsRefreshing(true);
    try {
      await refreshRepositories(projectId);
    } finally {
      setIsRefreshing(false);
    }
  }, [projectId, workspacePath, refreshRepositories]);

  const handlePull = useCallback(
    async (repoPath: string) => {
      const result = await window.api.git.pull(repoPath);
      if (!result.success) {
        console.error("Pull failed:", result.error);
      }
      await refreshRepoStatus(repoPath);
    },
    [refreshRepoStatus],
  );

  const handlePush = useCallback(
    async (repoPath: string) => {
      const result = await window.api.git.push(repoPath);
      if (!result.success) {
        console.error("Push failed:", result.error);
      }
      await refreshRepoStatus(repoPath);
    },
    [refreshRepoStatus],
  );

  return (
    <div className="space-y-3">
      {repositories.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-4 border border-dashed border-border rounded-lg">
          {workspacePath
            ? "No git repositories found in workspace"
            : "No workspace folder configured"}
        </div>
      ) : (
        repositories.map((repo) => (
          <RepoCard
            key={repo.id}
            repo={repo}
            status={repoStatuses.get(repo.path)}
            onPull={() => handlePull(repo.path)}
            onPush={() => handlePush(repo.path)}
          />
        ))
      )}

      {workspacePath && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="w-full"
        >
          {isRefreshing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh Repositories
        </Button>
      )}
    </div>
  );
}
