import { Loader2, AlertCircle, Inbox, LayoutGrid } from "lucide-react";
import { Button } from "../ui/button";

interface KanbanEmptyStateProps {
  type: "loading" | "error" | "no-team" | "no-issues";
  error?: string;
  onRetry?: () => void;
}

export function KanbanEmptyState({ type, error, onRetry }: KanbanEmptyStateProps) {
  switch (type) {
    case "loading":
      return (
        <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm mt-4">Loading issues...</p>
        </div>
      );

    case "error":
      return (
        <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm mt-4 text-destructive">Failed to load issues</p>
          {error && <p className="text-xs mt-1 text-muted-foreground/60">{error}</p>}
          {onRetry && (
            <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      );

    case "no-team":
      return (
        <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
          <LayoutGrid className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm mt-4">Unable to load tasks</p>
          <p className="text-xs mt-1 text-muted-foreground/60 text-center max-w-xs">
            Close this panel and reopen it from the sidebar to set up Linear integration
          </p>
        </div>
      );

    case "no-issues":
      return (
        <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
          <Inbox className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm mt-4">No issues in this team</p>
          <p className="text-xs mt-1 text-muted-foreground/60">
            Create issues in Linear to see them here
          </p>
        </div>
      );
  }
}
