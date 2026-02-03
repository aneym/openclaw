import {
  X,
  SplitSquareHorizontal,
  SplitSquareVertical,
  Copy,
  RefreshCw,
  Archive,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { PanelType } from "../../types";
import { useSession } from "../../gateway/hooks";
import { useSessionActions } from "../../hooks/use-session-actions";
import { useThreadStore } from "../../stores/thread-store";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

interface PanelToolbarProps {
  panelId: string;
  panelType: PanelType;
  title?: string;
  threadId: string;
  onSplit?: (direction: "horizontal" | "vertical") => void;
  onClose?: () => void;
}

export function PanelToolbar({ panelType, title, threadId, onSplit, onClose }: PanelToolbarProps) {
  // Get thread data for session actions
  const threadsMap = useThreadStore((s) => s.threads);
  const thread = useMemo(() => threadsMap.get(threadId), [threadsMap, threadId]);
  const sessionKey = thread?.sessionKey ?? "";

  // Session state and actions (only used for chat panels)
  const { isStreaming } = useSession(sessionKey);
  const { archive, reload, copySessionKey, isLoading, connected } = useSessionActions(
    sessionKey,
    threadId,
  );

  const [isReloading, setIsReloading] = useState(false);

  const isChatPanel = panelType === "chat";
  const actionsDisabled = isStreaming || isLoading || !connected || !sessionKey;

  // Generate title from panel type if not provided
  const displayTitle = title ?? getPanelTitle(panelType);

  const handleCopy = async () => {
    await copySessionKey();
  };

  const handleReload = async () => {
    setIsReloading(true);
    await reload();
    setIsReloading(false);
  };

  const handleArchive = async () => {
    await archive();
  };

  return (
    <div className="group/toolbar h-8 flex items-center justify-between px-3 border-b border-border bg-background/50 opacity-0 hover:opacity-100 transition-opacity duration-200">
      <div className="flex items-center gap-2 text-sm text-foreground/70 font-medium">
        <span className="mr-1">{getPanelIcon(panelType)}</span>
        <span className="truncate">{displayTitle}</span>
      </div>

      <div className="flex items-center gap-1">
        {/* Session actions for chat panels */}
        {isChatPanel && sessionKey && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy}>
                  <Copy className="h-3.5 w-3.5" />
                  <span className="sr-only">Copy session ID</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Copy session ID</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleReload}
                  disabled={actionsDisabled || isReloading}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isReloading ? "animate-spin" : ""}`} />
                  <span className="sr-only">Reload session</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Reload session (clear history)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleArchive}
                  disabled={actionsDisabled}
                >
                  <Archive className="h-3.5 w-3.5" />
                  <span className="sr-only">Archive session</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Archive session</TooltipContent>
            </Tooltip>
          </>
        )}

        {onSplit != null && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <SplitSquareHorizontal className="h-3.5 w-3.5" />
                <span className="sr-only">Split panel</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onSplit("horizontal")}>
                <SplitSquareHorizontal className="mr-2 h-4 w-4" />
                <span>Split Right</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSplit("vertical")}>
                <SplitSquareVertical className="mr-2 h-4 w-4" />
                <span>Split Down</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {onClose != null && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
            <span className="sr-only">Close panel</span>
          </Button>
        )}
      </div>
    </div>
  );
}

function getPanelIcon(type: PanelType): string {
  switch (type) {
    case "chat":
      return "💬";
    case "code-editor":
      return "📄";
    case "terminal":
      return "⌨️";
    case "coding-session":
      return "🔨";
    case "linear-board":
      return "📋";
    case "browser":
      return "🌐";
    case "preview":
      return "👁️";
    case "diff":
      return "🔄";
    case "empty":
      return "⬜";
    default:
      return "❓";
  }
}

function getPanelTitle(type: PanelType): string {
  switch (type) {
    case "chat":
      return "Chat";
    case "code-editor":
      return "Code Editor";
    case "terminal":
      return "Terminal";
    case "coding-session":
      return "Coding Session";
    case "linear-board":
      return "Linear Board";
    case "browser":
      return "Browser";
    case "preview":
      return "Preview";
    case "diff":
      return "Diff";
    case "empty":
      return "Empty Panel";
    default:
      return "Unknown";
  }
}
