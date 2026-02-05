import { useMemo } from "react";
import type { PanelType, PanelTab } from "../../types";
import { usePanelStore } from "../../stores/panel-store";
import { useProjectStore } from "../../stores/project-store";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { TABBED_PANEL_TYPES } from "../../types";
import { CodingSessionPanel } from "../coding/CodingSessionPanel";
import { KanbanBoard } from "../kanban/KanbanBoard";
import { KanbanEmptyState } from "../kanban/KanbanEmptyState";
import { BrowserPanel } from "./BrowserPanel";
import { ChatPanel } from "./ChatPanel";
import { EmptyChatPane } from "./EmptyChatPane";
import { EmptyTerminalPane } from "./EmptyTerminalPane";
import { PanelTypeSwitcher } from "./PanelTypeSwitcher";
import { TerminalPanel } from "./TerminalPanel";

interface PanelContentProps {
  type: PanelType;
  panelId: string;
  data?: Record<string, unknown>;
  workspaceId: string;
  activeChatId?: string;
  tabs?: PanelTab[];
  activeTabId?: string;
  isFocused?: boolean;
}

export function PanelContent({
  type,
  panelId,
  data,
  workspaceId,
  activeChatId,
  tabs,
  activeTabId,
  isFocused = false,
}: PanelContentProps) {
  // Get workspace to derive projectId if needed (for legacy panels)
  const workspacesMap = useWorkspaceStore((s) => s.workspaces);
  const workspace = useMemo(() => workspacesMap.get(workspaceId), [workspacesMap, workspaceId]);

  // Get project to derive linearTeamId (reacts to project updates)
  const projectsMap = useProjectStore((s) => s.projects);
  const project = useMemo(() => {
    const pid = workspace?.projectId;
    return pid ? projectsMap.get(pid) : undefined;
  }, [projectsMap, workspace?.projectId]);

  // Get all open chat IDs in this workspace (to prevent duplicates)
  const layoutsMap = usePanelStore((s) => s.layouts);
  const openChatIds = useMemo(() => {
    const layout = layoutsMap.get(workspaceId);
    if (!layout) return new Set<string>();
    const ids = new Set<string>();
    for (const [pId, panel] of layout.panels) {
      if (panel.type === "chat" && pId !== panelId) {
        // Collect data.chatId (legacy/non-tabbed)
        if (panel.data?.chatId) {
          ids.add(panel.data.chatId as string);
        }
        // Collect tab contentIds (tabbed panels)
        if (panel.tabs) {
          for (const tab of panel.tabs) {
            if (tab.contentId) ids.add(tab.contentId);
          }
        }
      }
    }
    return ids;
  }, [layoutsMap, workspaceId, panelId]);

  // Resolve active tab for tabbed panel types
  const activeTab = tabs?.find((t) => t.id === activeTabId);
  const isTabbed = TABBED_PANEL_TYPES.includes(type);

  switch (type) {
    case "chat": {
      // For tabbed chat panels, use tab's contentId (don't fall back to activeChatId)
      // This ensures duplicated/split panels show empty state, not the active chat
      if (isTabbed && tabs && tabs.length > 0) {
        const chatId = (data?.chatId as string | undefined) ?? activeTab?.contentId;

        if (!chatId) {
          // Tab has no contentId - show empty state with session picker
          return (
            <EmptyChatPane workspaceId={workspaceId} panelId={panelId} openChatIds={openChatIds} />
          );
        }
        return <ChatPanel chatId={chatId} autoFocus={isFocused} />;
      }

      // For non-tabbed (legacy) panels, fall back to activeChatId
      const chatId = (data?.chatId as string | undefined) ?? activeChatId;

      if (!chatId) {
        return (
          <EmptyChatPane workspaceId={workspaceId} panelId={panelId} openChatIds={openChatIds} />
        );
      }
      return <ChatPanel chatId={chatId} autoFocus={isFocused} />;
    }

    case "coding-session": {
      const sessionKey = data?.sessionKey as string | undefined;
      if (!sessionKey) {
        return (
          <div className="flex flex-col h-full">
            <div className="shrink-0 border-b border-border/50 px-3 py-1.5 bg-muted/30">
              <PanelTypeSwitcher
                workspaceId={workspaceId}
                panelId={panelId}
                currentType="coding-session"
              />
            </div>
            <div className="flex-1 flex flex-col items-center justify-center bg-background text-muted-foreground">
              <p className="text-sm">No coding session</p>
            </div>
          </div>
        );
      }
      return <CodingSessionPanel sessionKey={sessionKey} />;
    }

    case "terminal": {
      // For tabbed panels, use the active tab's contentId as terminalId
      // For non-tabbed (legacy), use panel data or panelId as fallback
      // The stable ID allows PTY to survive HMR (detach on unmount, reattach on remount)

      // Check if this is a managed terminal (AI-controlled)
      const isManaged = Boolean(data?.managed);

      if (isTabbed && tabs && tabs.length > 0) {
        const terminalId = activeTab?.contentId;
        const terminalCwd = activeTab?.data?.cwd as string | undefined;
        const tabManaged = Boolean(activeTab?.data?.managed) || isManaged;

        // If no contentId yet, show empty state with type switcher
        // This allows switching panel type before starting the terminal
        if (!terminalId) {
          return (
            <EmptyTerminalPane
              workspaceId={workspaceId}
              panelId={panelId}
              tabId={activeTab?.id}
              cwd={terminalCwd}
            />
          );
        }

        return (
          <TerminalPanel
            terminalId={terminalId}
            cwd={terminalCwd}
            managed={tabManaged}
            isFocused={isFocused}
          />
        );
      } else {
        // Legacy non-tabbed terminal - just start immediately
        const terminalId = (data?.terminalId as string | undefined) ?? `term-${panelId}`;
        const terminalCwd = data?.cwd as string | undefined;
        return (
          <TerminalPanel
            terminalId={terminalId}
            cwd={terminalCwd}
            managed={isManaged}
            isFocused={isFocused}
          />
        );
      }
    }

    case "browser": {
      const url = data?.url as string | undefined;
      const panelId = data?.panelId as string | undefined;
      return <BrowserPanel panelId={panelId ?? "browser-default"} initialUrl={url} />;
    }

    case "preview":
      return (
        <div className="flex flex-col h-full">
          <div className="shrink-0 border-b border-border/50 px-3 py-1.5 bg-muted/30">
            <PanelTypeSwitcher workspaceId={workspaceId} panelId={panelId} currentType="preview" />
          </div>
          <div className="flex-1 flex flex-col items-center justify-center bg-background text-muted-foreground">
            <p className="text-sm">Preview Panel</p>
            <p className="text-xs mt-2 text-muted-foreground/60">iOS Simulator / Web Preview</p>
          </div>
        </div>
      );

    case "tasks": {
      // Get teamId from panel data OR from project store (reacts to updates)
      const teamId = (data?.teamId as string | undefined) || project?.linearTeamId;
      // Get projectId from panel data OR from workspace (for legacy panels)
      const projectId = (data?.projectId as string | undefined) || workspace?.projectId;

      // projectId is required for setup wizard functionality
      if (!projectId) {
        return <KanbanEmptyState type="no-team" />;
      }

      // KanbanBoard handles the setup wizard when teamId is undefined
      return <KanbanBoard teamId={teamId} projectId={projectId} />;
    }

    case "code":
      return (
        <div className="flex flex-col h-full">
          <div className="shrink-0 border-b border-border/50 px-3 py-1.5 bg-muted/30">
            <PanelTypeSwitcher workspaceId={workspaceId} panelId={panelId} currentType="code" />
          </div>
          <div className="flex-1 flex flex-col items-center justify-center bg-background text-muted-foreground">
            <p className="text-sm">Code Panel</p>
            <p className="text-xs mt-2 text-muted-foreground/60">Diff view / File browser</p>
          </div>
        </div>
      );

    case "empty":
      return (
        <div className="flex flex-col h-full">
          <div className="shrink-0 border-b border-border/50 px-3 py-1.5 bg-muted/30">
            <PanelTypeSwitcher workspaceId={workspaceId} panelId={panelId} currentType="empty" />
          </div>
          <div className="flex-1 flex flex-col items-center justify-center bg-muted/20 text-muted-foreground border-2 border-dashed border-muted">
            <p className="text-sm">Empty Panel</p>
            <p className="text-xs mt-2">Choose a panel type above</p>
          </div>
        </div>
      );

    default:
      return (
        <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
          <p className="text-sm">Unknown panel type: {type}</p>
        </div>
      );
  }
}
