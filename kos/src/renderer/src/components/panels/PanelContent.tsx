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
import { TerminalPanel } from "./TerminalPanel";

interface PanelContentProps {
  type: PanelType;
  panelId: string;
  data?: Record<string, unknown>;
  workspaceId: string;
  activeChatId?: string;
  tabs?: PanelTab[];
  activeTabId?: string;
}

export function PanelContent({
  type,
  panelId,
  data,
  workspaceId,
  activeChatId,
  tabs,
  activeTabId,
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
      if (panel.type === "chat" && panel.data?.chatId && pId !== panelId) {
        ids.add(panel.data.chatId as string);
      }
    }
    return ids;
  }, [layoutsMap, workspaceId, panelId]);

  // Resolve active tab for tabbed panel types
  const activeTab = tabs?.find((t) => t.id === activeTabId);
  const isTabbed = TABBED_PANEL_TYPES.includes(type);

  switch (type) {
    case "chat": {
      // For tabbed panels, use the active tab's contentId
      // For non-tabbed (legacy), use panel data or activeChatId
      let chatId: string | undefined;

      if (isTabbed && tabs && tabs.length > 0) {
        // Tab-based: use active tab's contentId
        chatId = activeTab?.contentId;
      } else {
        // Legacy: check panel data
        const explicitChatId = data?.chatId as string | undefined;
        const hasExplicitData = data !== undefined;
        chatId = explicitChatId ?? (hasExplicitData ? undefined : activeChatId);
      }

      if (!chatId) {
        // Show empty state with session picker
        return (
          <EmptyChatPane workspaceId={workspaceId} panelId={panelId} openChatIds={openChatIds} />
        );
      }
      return <ChatPanel chatId={chatId} />;
    }

    case "coding-session": {
      const sessionKey = data?.sessionKey as string | undefined;
      if (!sessionKey) {
        return (
          <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
            <p className="text-sm">No coding session</p>
          </div>
        );
      }
      return <CodingSessionPanel sessionKey={sessionKey} />;
    }

    case "terminal": {
      // For tabbed panels, use the active tab's contentId as terminalId
      // For non-tabbed (legacy), use panel data
      let terminalId: string | undefined;
      let terminalCwd: string | undefined;

      if (isTabbed && tabs && tabs.length > 0) {
        terminalId = activeTab?.contentId;
        terminalCwd = activeTab?.data?.cwd as string | undefined;
      } else {
        terminalId = data?.terminalId as string | undefined;
        terminalCwd = data?.cwd as string | undefined;
      }

      return <TerminalPanel terminalId={terminalId} cwd={terminalCwd} />;
    }

    case "browser": {
      const url = data?.url as string | undefined;
      const panelId = data?.panelId as string | undefined;
      return <BrowserPanel panelId={panelId ?? "browser-default"} initialUrl={url} />;
    }

    case "preview":
      return (
        <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
          <p className="text-sm">Preview Panel</p>
          <p className="text-xs mt-2 text-muted-foreground/60">iOS Simulator / Web Preview</p>
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
        <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
          <p className="text-sm">Code Panel</p>
          <p className="text-xs mt-2 text-muted-foreground/60">Diff view / File browser</p>
        </div>
      );

    case "empty":
      return (
        <div className="flex flex-col items-center justify-center h-full bg-muted/20 text-muted-foreground border-2 border-dashed border-muted">
          <p className="text-sm">Empty Panel</p>
          <p className="text-xs mt-2">Split to add content</p>
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
