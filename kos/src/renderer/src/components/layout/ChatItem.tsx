import { Archive, Copy, FolderInput, Inbox, MoreHorizontal } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { Chat, Project } from "../../types";
import { ChannelIcon } from "../../lib/channel-icons";
import { ProjectIcon } from "../../lib/project-icons";
import { cn } from "../../lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

interface ChatItemProps {
  chat: Chat;
  isActive: boolean;
  isOpenInPane?: boolean;
  onSelect: (options?: { splitPane?: boolean }) => void;
  onArchive: () => void;
  onCopySessionId: () => void;
  project?: Project;
  showProjectBadge?: boolean;
  projects?: Project[];
  onAssignToProject?: (chatId: string, projectId: string | null) => void;
  onRename?: (title: string) => void | Promise<void>;
}

export const ChatItem = memo(function ChatItem({
  chat,
  isActive,
  isOpenInPane = false,
  onSelect,
  onArchive,
  onCopySessionId,
  project,
  showProjectBadge = false,
  projects,
  onAssignToProject,
  onRename,
}: ChatItemProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(chat.title);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isRenaming) {
      setRenameValue(chat.title);
    }
  }, [chat.title, isRenaming]);

  useEffect(() => {
    if (!isRenaming) {
      return;
    }
    const raf = window.requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [isRenaming]);

  const handleArchive = (e: React.MouseEvent) => {
    e.stopPropagation();
    onArchive();
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCopySessionId();
  };

  const handleAssignToProject = (projectId: string | null) => {
    onAssignToProject?.(chat.id, projectId);
  };

  const showContextMenu = projects && onAssignToProject;

  // Stable click handler
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (isRenaming) {
        return;
      }
      onSelect({ splitPane: e.metaKey || e.ctrlKey });
    },
    [isRenaming, onSelect],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        if (isRenaming) {
          return;
        }
        e.preventDefault();
        onSelect({ splitPane: e.metaKey || e.ctrlKey });
      }
    },
    [isRenaming, onSelect],
  );

  const startRename = useCallback(
    (e: React.MouseEvent) => {
      if (!onRename) {
        return;
      }
      e.stopPropagation();
      setRenameValue(chat.title);
      setIsRenaming(true);
    },
    [chat.title, onRename],
  );

  const commitRename = useCallback(() => {
    const next = renameValue.trim();
    setIsRenaming(false);
    if (!onRename || !next || next === chat.title) {
      setRenameValue(chat.title);
      return;
    }
    void onRename(next);
  }, [chat.title, onRename, renameValue]);

  const cancelRename = useCallback(() => {
    setIsRenaming(false);
    setRenameValue(chat.title);
  }, [chat.title]);

  return (
    <div
      className={cn(
        "group w-full rounded-md text-left text-sm transition-colors",
        "flex items-center gap-2 relative cursor-pointer px-3 py-2",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : isOpenInPane
            ? "bg-sidebar-accent/50 text-sidebar-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
      )}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label={`Open chat: ${chat.title}`}
      aria-current={isActive ? "true" : undefined}
    >
      {chat.channel && <ChannelIcon channel={chat.channel} className="h-3.5 w-3.5 shrink-0" />}
      <div className="flex-1 min-w-0">
        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                (e.currentTarget as HTMLInputElement).blur();
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                cancelRename();
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "h-6 w-full rounded-sm border border-border bg-background px-1.5",
              "text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            )}
            aria-label="Rename chat"
          />
        ) : (
          <div className="truncate" onDoubleClick={startRename} title="Double-click to rename">
            {chat.title}
          </div>
        )}
        {chat.subtitle && (
          <div className="text-xs text-muted-foreground truncate">{chat.subtitle}</div>
        )}
        {showProjectBadge && project && (
          <div className="text-xs text-muted-foreground/70 truncate flex items-center gap-1 mt-0.5">
            <ProjectIcon icon={project.icon} size="sm" />
            <span>{project.name}</span>
          </div>
        )}
      </div>
      {chat.hasUnread && (
        <span className="h-2 w-2 rounded-full bg-primary shrink-0" aria-label="Unread" />
      )}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {chat.status !== "archived" && (
          <button
            onClick={handleArchive}
            className={cn("shrink-0 p-1 rounded-sm", "hover:bg-accent-foreground/10")}
            title="Archive chat"
            aria-label="Archive chat"
          >
            <Archive className="h-3 w-3" />
          </button>
        )}
        {showContextMenu ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className={cn("shrink-0 p-1 rounded-sm", "hover:bg-accent-foreground/10")}
                title="More actions"
                aria-label="More actions"
              >
                <MoreHorizontal className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={handleCopy}>
                <Copy className="h-4 w-4 mr-2" />
                Copy Session ID
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <FolderInput className="h-4 w-4 mr-2" />
                  Assign to Project
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-48">
                  <DropdownMenuItem
                    onClick={() => handleAssignToProject(null)}
                    className={cn(!chat.projectId && "bg-accent")}
                  >
                    <Inbox className="h-4 w-4 mr-2" />
                    Unassigned
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {projects.map((p) => (
                    <DropdownMenuItem
                      key={p.id}
                      onClick={() => handleAssignToProject(p.id)}
                      className={cn(chat.projectId === p.id && "bg-accent")}
                    >
                      <ProjectIcon icon={p.icon} className="mr-2" />
                      {p.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <button
            onClick={handleCopy}
            className={cn("shrink-0 p-1 rounded-sm", "hover:bg-accent-foreground/10")}
            title="Copy session ID"
            aria-label="Copy session ID"
          >
            <Copy className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
});
