import {
  X,
  SplitSquareHorizontal,
  SplitSquareVertical,
  Copy,
  RefreshCw,
  Archive,
  MessageSquare,
  Hammer,
  Keyboard,
  Globe,
  Eye,
  ClipboardList,
  FileCode,
  Square,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import { useMemo, memo } from "react";
import type { Chat, PanelType } from "../../types";
import { useChatSession } from "../../hooks/use-chat-session";
import { useSessionActions } from "../../hooks/use-session-actions";
import { useChatStore } from "../../stores/chat-store";
import { usePanelStore } from "../../stores/panel-store";
import { PANEL_TYPE_LABELS, USER_PANEL_TYPES } from "../../types/panel";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { DraggableTitlebar } from "./DraggableTitlebar";

interface PanelToolbarProps {
  panelId: string;
  panelType: PanelType;
  title?: string;
  workspaceId: string;
  activeChatId?: string;
  panelData?: Record<string, unknown>;
  onClose?: () => void;
}

export const PanelToolbar = memo(function PanelToolbar({
  panelId,
  panelType,
  title,
  workspaceId,
  activeChatId,
  panelData,
  onClose,
}: PanelToolbarProps) {
  // Get chat data for session actions
  const chatsMap = useChatStore((s) => s.chats);
  const updatePanelData = usePanelStore((s) => s.updatePanelData);
  const splitPanel = usePanelStore((s) => s.splitPanel);

  // Use chatId from panel data if available, otherwise fall back to workspace's active chat
  const chatId = (panelData?.chatId as string | undefined) || activeChatId;

  const chat = useMemo(
    () => (chatId ? (chatsMap.get(chatId) as Chat | undefined) : undefined),
    [chatsMap, chatId],
  );
  const sessionKey = chat?.sessionKey ?? "";

  // Session state and actions (only used for chat panels)
  const { isStreaming } = useChatSession(sessionKey, chatId ?? "");
  const { archive, copySessionKey, isLoading, connected } = useSessionActions(
    sessionKey,
    chatId ?? "",
  );

  const isChatPanel = panelType === "chat";
  const actionsDisabled = isStreaming || isLoading || !connected || !sessionKey;

  // Generate title: for chat panels, show the thread title
  const displayTitle = useMemo(() => {
    if (title) return title;
    if (isChatPanel && chat?.title) return chat.title;
    return getPanelTitle(panelType);
  }, [title, isChatPanel, chat?.title, panelType]);

  const handleCopy = async () => {
    await copySessionKey();
  };

  const handleNewThread = () => {
    // Clear the panel's chatId to show empty state (new thread picker)
    updatePanelData(workspaceId, panelId, { chatId: undefined });
  };

  const handleArchive = async () => {
    await archive();
  };

  const handleSplitWithType = (direction: "horizontal" | "vertical", type: PanelType) => {
    splitPanel(workspaceId, panelId, direction, type, type === "chat" ? {} : undefined);
  };

  return (
    <div className="h-8 flex items-center border-b border-border bg-background/50">
      <DraggableTitlebar
        panelId={panelId}
        workspaceId={workspaceId}
        className="flex-1 min-w-0 h-full overflow-hidden"
      >
        <div className="flex items-center gap-2 text-sm text-foreground/70 font-medium px-2 min-w-0 w-full overflow-hidden">
          <PanelTypeIcon type={panelType} className="h-4 w-4 shrink-0" />
          <span className="truncate flex-1 min-w-0">{displayTitle}</span>
        </div>
      </DraggableTitlebar>

      <div className="flex items-center gap-1 shrink-0 pr-1">
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
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleNewThread}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span className="sr-only">New thread</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">New thread</TooltipContent>
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <SplitSquareHorizontal className="h-3.5 w-3.5" />
              <span className="sr-only">Split panel</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <SplitSquareHorizontal className="mr-2 h-4 w-4" />
                <span>Split Right</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {USER_PANEL_TYPES.map((type) => (
                  <DropdownMenuItem
                    key={type}
                    onClick={() => handleSplitWithType("horizontal", type)}
                  >
                    <PanelTypeIcon type={type} className="mr-2 h-4 w-4" />
                    <span>{PANEL_TYPE_LABELS[type]}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <SplitSquareVertical className="mr-2 h-4 w-4" />
                <span>Split Down</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {USER_PANEL_TYPES.map((type) => (
                  <DropdownMenuItem
                    key={type}
                    onClick={() => handleSplitWithType("vertical", type)}
                  >
                    <PanelTypeIcon type={type} className="mr-2 h-4 w-4" />
                    <span>{PANEL_TYPE_LABELS[type]}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>

        {onClose != null && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
            <span className="sr-only">Close panel</span>
          </Button>
        )}
      </div>
    </div>
  );
});

/** Static icon map for panel types */
const PANEL_ICONS: Record<PanelType, LucideIcon> = {
  chat: MessageSquare,
  "coding-session": Hammer,
  terminal: Keyboard,
  browser: Globe,
  preview: Eye,
  tasks: ClipboardList,
  code: FileCode,
  empty: Square,
};

/** Renders the appropriate icon for a panel type */
export function PanelTypeIcon({ type, className }: { type: PanelType; className?: string }) {
  const Icon = PANEL_ICONS[type] || HelpCircle;
  return <Icon className={className} />;
}

function getPanelTitle(type: PanelType): string {
  switch (type) {
    case "chat":
      return "Chat";
    case "coding-session":
      return "Coding Session";
    case "terminal":
      return "Terminal";
    case "browser":
      return "Browser";
    case "preview":
      return "Preview";
    case "tasks":
      return "Tasks";
    case "code":
      return "Code";
    case "empty":
      return "Empty Panel";
    default:
      return "Unknown";
  }
}
