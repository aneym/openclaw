import { useCallback, useMemo, useRef, useState } from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import type { Project } from "../../types";
import { useKeyboardShortcuts } from "../../hooks/use-keyboard-shortcuts";
import { useChatStore } from "../../stores/chat-store";
import { usePanelStore } from "../../stores/panel-store";
import { useProjectStore } from "../../stores/project-store";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { PanelContainer } from "../panels/PanelContainer";
import { Settings } from "../settings/Settings";
import { CommandPalette } from "./CommandPalette";
import { ProjectTabs } from "./ProjectTabs";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";

const SIDEBAR_STORAGE_KEY = "kos-sidebar-layout-v2";

type View = "home" | "settings";

export function Shell() {
  const [view, setView] = useState<View>("home");
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const sidebarRef = useRef<ImperativePanelHandle>(null);

  // Project state
  const projectsMap = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);

  // Workspace state
  const workspacesMap = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceByProject = useWorkspaceStore((s) => s.activeWorkspaceByProject);
  const getActiveWorkspace = useWorkspaceStore((s) => s.getActiveWorkspace);

  // Chat state
  const chatsMap = useChatStore((s) => s.chats);
  const activeChatByWorkspace = useChatStore((s) => s.activeChatByWorkspace);

  // Panel state
  const closePanel = usePanelStore((s) => s.closePanel);
  const splitPanel = usePanelStore((s) => s.splitPanel);
  const getFocusedPanelId = usePanelStore((s) => s.getFocusedPanelId);

  // Derived values
  const projects = useMemo(
    () =>
      Array.from(projectsMap.values() as Iterable<Project>).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [projectsMap],
  );

  const activeProject = useMemo(
    () => (activeProjectId ? (projectsMap.get(activeProjectId) as Project | undefined) : undefined),
    [projectsMap, activeProjectId],
  );

  const activeWorkspace = useMemo(() => {
    if (!activeProjectId) return undefined;
    return getActiveWorkspace(activeProjectId);
  }, [activeProjectId, getActiveWorkspace, activeWorkspaceByProject, workspacesMap]);

  const activeChat = useMemo(() => {
    if (!activeWorkspace) return undefined;
    const chatId = activeChatByWorkspace.get(activeWorkspace.id);
    return chatId ? chatsMap.get(chatId) : undefined;
  }, [activeWorkspace, activeChatByWorkspace, chatsMap]);

  const toggleSidebar = useCallback(() => {
    const panel = sidebarRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }, []);

  const handleSelectProject = useCallback(
    (projectId: string) => {
      setActiveProject(projectId);
      setView("home");
    },
    [setActiveProject],
  );

  // Keyboard shortcuts
  const shortcuts = useMemo(() => {
    const items = [
      {
        key: "k",
        metaKey: true,
        shiftKey: false,
        handler: () => setCommandPaletteOpen(true),
        description: "Open command palette",
      },
      {
        key: "\\",
        metaKey: true,
        shiftKey: false,
        handler: toggleSidebar,
        description: "Toggle sidebar",
      },
      {
        key: "w",
        metaKey: true,
        shiftKey: false,
        handler: () => {
          if (!activeWorkspace) return;
          const panelId = getFocusedPanelId(activeWorkspace.id);
          if (panelId) {
            closePanel(activeWorkspace.id, panelId);
          }
        },
        description: "Close current panel",
      },
      {
        key: "\\",
        metaKey: true,
        shiftKey: true,
        handler: () => {
          if (!activeWorkspace) return;
          const panelId = getFocusedPanelId(activeWorkspace.id);
          if (panelId) {
            splitPanel(activeWorkspace.id, panelId, "horizontal", "empty");
          }
        },
        description: "Split panel right",
      },
    ];

    // Number shortcuts for project switching
    for (let i = 1; i <= 9; i += 1) {
      items.push({
        key: String(i),
        metaKey: true,
        shiftKey: false,
        handler: () => {
          const project = projects[i - 1];
          if (project) {
            handleSelectProject(project.id);
          }
        },
        description: `Switch to project ${i}`,
      });
    }

    return items;
  }, [
    toggleSidebar,
    activeWorkspace,
    getFocusedPanelId,
    closePanel,
    splitPanel,
    projects,
    handleSelectProject,
  ]);

  useKeyboardShortcuts(shortcuts);

  return (
    <div className="h-screen flex flex-col">
      {/* macOS titlebar drag region */}
      <div
        className="shrink-0 [-webkit-app-region:drag]"
        style={{ height: "var(--titlebar-height)" }}
      />

      {/* Project tabs */}
      <ProjectTabs
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={handleSelectProject}
        onSettings={() => setView("settings")}
      />

      <PanelGroup direction="horizontal" autoSaveId={SIDEBAR_STORAGE_KEY} className="flex-1">
        <Panel
          ref={sidebarRef}
          id="sidebar"
          order={1}
          defaultSize={18}
          minSize={12}
          maxSize={30}
          collapsible
          collapsedSize={0}
        >
          <Sidebar
            projectId={activeProjectId}
            workspaceId={activeWorkspace?.id}
            onNavigate={setView}
            currentView={view}
          />
        </Panel>
        <PanelResizeHandle className="w-1 bg-transparent hover:bg-accent/50 active:bg-accent transition-colors cursor-col-resize" />
        <Panel id="main" order={2} minSize={50}>
          <main className="h-full bg-background overflow-hidden flex flex-col">
            <div className="flex-1 overflow-hidden">
              {view === "settings" ? (
                <Settings />
              ) : activeWorkspace ? (
                <PanelContainer workspaceId={activeWorkspace.id} activeChatId={activeChat?.id} />
              ) : (
                <div className="flex-1 flex items-center justify-center h-full">
                  <div className="text-center max-w-md">
                    <h1 className="text-4xl font-bold mb-4">Welcome to kOS</h1>
                    <p className="text-muted-foreground mb-6">
                      {activeProject?.icon || "🚀"} {activeProject?.name || "No project selected"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Select a project from the tabs above to get started.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </main>
        </Panel>
      </PanelGroup>

      <StatusBar />

      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onNavigate={setView}
        onToggleSidebar={toggleSidebar}
      />
    </div>
  );
}
