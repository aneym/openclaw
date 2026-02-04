import { ArrowDown, ArrowUp, Circle, GitBranch, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import type { RepoConfig, RepoStatus } from "../../types";
import { Button } from "../ui/button";

interface RepoCardProps {
  repo: RepoConfig;
  status?: RepoStatus;
  onPull: () => Promise<void>;
  onPush: () => Promise<void>;
}

export function RepoCard({ repo, status, onPull, onPush }: RepoCardProps) {
  const [isPulling, setIsPulling] = useState(false);
  const [isPushing, setIsPushing] = useState(false);

  const handlePull = useCallback(async () => {
    setIsPulling(true);
    try {
      await onPull();
    } finally {
      setIsPulling(false);
    }
  }, [onPull]);

  const handlePush = useCallback(async () => {
    setIsPushing(true);
    try {
      await onPush();
    } finally {
      setIsPushing(false);
    }
  }, [onPush]);

  const hasChanges = status?.ahead || status?.behind || status?.dirty;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
      <GitBranch className="h-5 w-5 text-muted-foreground flex-shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">
          {repo.name || repo.path.split("/").pop()}
          {repo.isMainRepo && <span className="ml-2 text-xs text-muted-foreground">(main)</span>}
        </div>
        <div className="text-xs text-muted-foreground truncate">{repo.path}</div>
      </div>

      {/* Status indicators */}
      {status && hasChanges && (
        <div className="flex items-center gap-2 text-xs">
          {status.behind > 0 && (
            <span className="flex items-center gap-0.5 text-blue-500">
              <ArrowDown className="h-3 w-3" />
              {status.behind}
            </span>
          )}
          {status.ahead > 0 && (
            <span className="flex items-center gap-0.5 text-green-500">
              <ArrowUp className="h-3 w-3" />
              {status.ahead}
            </span>
          )}
          {status.dirty && (
            <span className="flex items-center gap-0.5 text-yellow-500" title="Uncommitted changes">
              <Circle className="h-2 w-2 fill-current" />
            </span>
          )}
        </div>
      )}

      {/* Pull/Push buttons */}
      {status && (
        <div className="flex items-center gap-1">
          {status.behind > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePull}
              disabled={isPulling}
              className="h-7 px-2"
            >
              {isPulling ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ArrowDown className="h-3 w-3" />
              )}
            </Button>
          )}
          {status.ahead > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePush}
              disabled={isPushing}
              className="h-7 px-2"
            >
              {isPushing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ArrowUp className="h-3 w-3" />
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
