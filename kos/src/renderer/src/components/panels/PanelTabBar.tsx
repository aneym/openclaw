import { useDraggable } from "@dnd-kit/core";
import {
  X,
  Plus,
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
import { memo, useMemo, useCallback } from "react";
import type { PaneDragData } from "../../lib/panel-dnd";
import type { Chat, PanelType, PanelTab } from "../../types";
import { useChatSession } from "../../hooks/use-chat-session";
import { useSessionActions } from "../../hooks/use-session-actions";
import { cn } from "../../lib/utils";
import { useChatStore } from "../../stores/chat-store";
import { usePanelStore } from "../../stores/panel-store";
import { TABBED_PANEL_TYPES } from "../../types";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

interface PanelTabBarProps {
  panelId: string;
  panelType: PanelType;
  workspaceId: string;
  activeChatId?: string;
  panelData?: Record<string, unknown>;
  tabs?: PanelTab[];
  activeTabId?: string;
  onClose?: () => void;
}

export const PanelTabBar = memo(function PanelTabBar({
  panelId,
  panelType,
  workspaceId,
  activeChatId,
  panelData,
  tabs,
  activeTabId,
  onClose,
}: PanelTabBarProps) {
  const chatsMap = useChatStore((s) => s.chats);
  const addTab = usePanelStore((s) => s.addTab);
  const closeTab = usePanelStore((s) => s.closeTab);
  const setActiveTab = usePanelStore((s) => s.setActiveTab);

  const isTabbed = TABBED_PANEL_TYPES.includes(panelType);

  // Resolve chat for session actions
  const chatId = useMemo(() => {
    if (panelType !== "chat") return undefined;

    // If tabbed with tabs, use active tab's contentId
    if (isTabbed && tabs && tabs.length > 0) {
      const activeTab = tabs.find((t) => t.id === activeTabId);
      return activeTab?.contentId;
    }

    // Fall back to panel data or activeChatId
    return (panelData?.chatId as string | undefined) || activeChatId;
  }, [panelType, isTabbed, tabs, activeTabId, panelData, activeChatId]);

  const chat = useMemo(
    () => (chatId ? (chatsMap.get(chatId) as Chat | undefined) : undefined),
    [chatsMap, chatId],
  );
  const sessionKey = chat?.sessionKey ?? "";

  // Session state and actions (only for chat panels)
  const { isStreaming } = useChatSession(sessionKey, chatId ?? "");
  const { archive, reload, copySessionKey, isLoading, connected } = useSessionActions(
    sessionKey,
    chatId ?? "",
  );

  // Drag handle on the panel icon (works for all panels, tabbed or not)
  const dragData: PaneDragData = useMemo(
    () => ({ type: "pane", panelId, workspaceId }),
    [panelId, workspaceId],
  );
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `pane-${panelId}`,
    data: dragData,
  });

  const isChatPanel = panelType === "chat";
  const actionsDisabled = isStreaming || isLoading || !connected || !sessionKey;

  const handleAddTab = useCallback(() => {
    addTab(workspaceId, panelId);
  }, [addTab, workspaceId, panelId]);

  const handleCloseTab = useCallback(
    (tabId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      closeTab(workspaceId, panelId, tabId);
    },
    [closeTab, workspaceId, panelId],
  );

  const handleSelectTab = useCallback(
    (tabId: string) => {
      setActiveTab(workspaceId, panelId, tabId);
    },
    [setActiveTab, workspaceId, panelId],
  );

  // Get tab label
  const getTabLabel = useCallback(
    (tab: PanelTab, index: number) => {
      if (panelType === "chat" && tab.contentId) {
        const tabChat = chatsMap.get(tab.contentId) as Chat | undefined;
        return tabChat?.title || `Chat ${index + 1}`;
      }
      if (panelType === "terminal" && tab.contentId) {
        return tab.contentId;
      }
      return panelType === "chat" ? `New Chat` : `Tab ${index + 1}`;
    },
    [panelType, chatsMap],
  );

  return (
    <div className="h-8 flex items-center border-b border-border bg-background/50 overflow-hidden">
      {isTabbed && tabs && tabs.length > 0 ? (
        <>
          {/* Tabbed: icon is the drag handle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                ref={setDragRef}
                {...listeners}
                {...attributes}
                className={cn(
                  "flex items-center shrink-0 p-1 ml-1 rounded cursor-grab hover:bg-accent/50",
                  isDragging && "cursor-grabbing",
                )}
                title="Drag to rearrange"
              >
                <PanelTypeIcon type={panelType} className="h-4 w-4 text-foreground/70" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">Drag to rearrange</TooltipContent>
          </Tooltip>

          {/* Tabs */}
          <div className="flex items-center flex-1 min-w-0 overflow-x-auto scrollbar-none">
            {tabs.map((tab, index) => (
              <TabButton
                key={tab.id}
                tab={tab}
                index={index}
                isActive={tab.id === activeTabId}
                label={getTabLabel(tab, index)}
                canClose={tabs.length > 1}
                onSelect={() => handleSelectTab(tab.id)}
                onClose={(e) => handleCloseTab(tab.id, e)}
              />
            ))}
            {/* Add tab button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 ml-1"
                  onClick={handleAddTab}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="sr-only">New tab</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">New tab (Cmd+T)</TooltipContent>
            </Tooltip>
          </div>
        </>
      ) : (
        /* Non-tabbed: entire icon+title row is draggable */
        <div
          ref={setDragRef}
          {...listeners}
          {...attributes}
          className={cn(
            "flex items-center flex-1 min-w-0 h-full cursor-grab",
            isDragging && "cursor-grabbing",
          )}
          title="Drag to rearrange"
        >
          <div className="flex items-center shrink-0 pl-2 pr-1">
            <PanelTypeIcon type={panelType} className="h-4 w-4 text-foreground/70" />
          </div>
          <div className="flex items-center text-sm text-foreground/70 font-medium px-1 min-w-0 overflow-hidden">
            <span className="truncate">{getPanelTitle(panelType, chat?.title)}</span>
          </div>
        </div>
      )}

      {/* Actions area */}
      <div className="flex items-center gap-0.5 shrink-0 pr-1">
        {/* Session actions for chat panels */}
        {isChatPanel && sessionKey && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => copySessionKey()}
                >
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
                  onClick={() => reload()}
                  disabled={actionsDisabled}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span className="sr-only">Reload session</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Reload session</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => archive()}
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

        {/* Close panel button */}
        {onClose && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
            <span className="sr-only">Close panel</span>
          </Button>
        )}
      </div>
    </div>
  );
});

/** Individual tab button */
interface TabButtonProps {
  tab: PanelTab;
  index: number;
  isActive: boolean;
  label: string;
  canClose: boolean;
  onSelect: () => void;
  onClose: (e: React.MouseEvent) => void;
}

const TabButton = memo(function TabButton({
  tab,
  isActive,
  label,
  canClose,
  onSelect,
  onClose,
}: TabButtonProps) {
  const chatsMap = useChatStore((s) => s.chats);
  const hasUnread = useMemo(() => {
    if (!tab.contentId) return false;
    const tabChat = chatsMap.get(tab.contentId) as Chat | undefined;
    return tabChat?.hasUnread === true;
  }, [chatsMap, tab.contentId]);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group flex items-center gap-1 px-2 h-7 text-xs font-medium border-b-2 transition-colors",
        "hover:bg-accent/50 max-w-[150px]",
        isActive
          ? "border-primary text-foreground"
          : "border-transparent text-foreground/60 hover:text-foreground",
      )}
    >
      <span className="truncate">{label}</span>
      {hasUnread && (
        <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" aria-label="Unread" />
      )}
      {canClose && (
        <span
          role="button"
          tabIndex={0}
          onClick={onClose}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              onClose(e as unknown as React.MouseEvent);
            }
          }}
          className="ml-1 p-0.5 rounded hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="h-3 w-3" />
        </span>
      )}
    </button>
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
function PanelTypeIcon({ type, className }: { type: PanelType; className?: string }) {
  const Icon = PANEL_ICONS[type] || HelpCircle;
  return <Icon className={className} />;
}

function getPanelTitle(type: PanelType, chatTitle?: string): string {
  if (type === "chat" && chatTitle) return chatTitle;
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
