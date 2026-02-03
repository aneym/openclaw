import { Archive, ArchiveRestore, MoreHorizontal } from "lucide-react";
import type { Thread } from "../../types";
import { useSession } from "../../gateway/hooks";
import { useSessionActions } from "../../hooks/use-session-actions";
import { formatRelativeTime } from "../../lib/time-utils";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

interface ThreadItemProps {
  thread: Thread;
  isActive: boolean;
  onClick: () => void;
}

export function ThreadItem({ thread, isActive, onClick }: ThreadItemProps) {
  const { isStreaming } = useSession(thread.sessionKey);
  const { archive, unarchive, isLoading, connected } = useSessionActions(
    thread.sessionKey,
    thread.id,
  );

  const isArchived = thread.status === "archived";
  const actionsDisabled = isStreaming || isLoading || !connected;

  // Status for the dot
  const status = isStreaming ? "streaming" : "idle";

  // Status dot color
  const statusDotColor = status === "streaming" ? "bg-blue-500" : "bg-muted-foreground/30";

  // Relative timestamp
  const relativeTime = formatRelativeTime(thread.lastMessageAt);

  const handleArchive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await archive();
  };

  const handleUnarchive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await unarchive();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={`w-full px-3 py-2 rounded-lg text-left transition-all duration-200 group cursor-pointer ${
        isActive
          ? "bg-accent text-accent-foreground shadow-sm"
          : "hover:bg-accent/50 text-muted-foreground hover:text-foreground"
      }`}
    >
      <div className="flex items-start gap-2.5">
        {/* Status dot */}
        <div className="mt-1.5 shrink-0">
          <div
            className={`h-2 w-2 rounded-full transition-all duration-200 ${statusDotColor} ${
              status === "streaming" ? "animate-pulse" : ""
            }`}
          />
        </div>

        {/* Thread content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <div className="font-medium truncate text-sm">{thread.title}</div>
            <div className="flex items-center gap-1 shrink-0">
              {/* Action menu - hidden by default, shown on hover */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 ${
                      isActive ? "hover:bg-accent-foreground/10" : "hover:bg-accent/70"
                    }`}
                    onClick={(e) => e.stopPropagation()}
                    disabled={actionsDisabled}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                    <span className="sr-only">Thread actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  {isArchived ? (
                    <DropdownMenuItem onClick={handleUnarchive} disabled={actionsDisabled}>
                      <ArchiveRestore className="mr-2 h-4 w-4" />
                      Unarchive
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={handleArchive} disabled={actionsDisabled}>
                      <Archive className="mr-2 h-4 w-4" />
                      Archive
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <div
                className={`text-xs transition-opacity duration-200 ${
                  isActive ? "opacity-60" : "opacity-50 group-hover:opacity-70"
                }`}
              >
                {relativeTime}
              </div>
            </div>
          </div>
          {thread.subtitle && (
            <div
              className={`text-xs truncate mt-0.5 transition-opacity duration-200 ${
                isActive ? "opacity-60" : "opacity-50 group-hover:opacity-70"
              }`}
            >
              {thread.subtitle}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
