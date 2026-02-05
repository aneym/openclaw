import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import type { Project, View } from "../../types";
import { useKeyboardShortcuts } from "../../hooks/use-keyboard-shortcuts";
import { ProjectIcon } from "../../lib/project-icons";
import { useChatStore } from "../../stores/chat-store";
import { useDashboardStore } from "../../stores/dashboard-store";
import { usePanelStore } from "../../stores/panel-store";
import { useProjectStore } from "../../stores/project-store";
import { useSettingsStore } from "../../stores/settings-store";
import { HOME_WORKSPACE_ID, useWorkspaceStore } from "../../stores/workspace-store";
import { PanelContainer } from "../panels/PanelContainer";
import { ProjectCreateDialog, ProjectSettingsDialog } from "../project";
import { Settings } from "../settings/Settings";
import { CommandPalette } from "./CommandPalette";
import { ProfileSwitcherDialog } from "./ProfileSwitcherDialog";
import { HOME_PROJECT_ID, ProjectTabs } from "./ProjectTabs";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";

const SIDEBAR_STORAGE_KEY = "kos-sidebar-layout-v2";

export function Shell() {
  const [view, setView] = useState<View>("home");
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [profileSwitcherOpen, setProfileSwitcherOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [settingsProjectId, setSettingsProjectId] = useState<string | null>(null);
  const sidebarRef = useRef<ImperativePanelHandle>(null);

  // Project state
  const projectsMap = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const initializeProjects = useProjectStore((s) => s.initialize);
  const isProjectsInitialized = useProjectStore((s) => s.isInitialized);

  // Settings state
  const initializeSettings = useSettingsStore((s) => s.initialize);
  const isSettingsInitialized = useSettingsStore((s) => s.isInitialized);

  // Initialize stores on mount
  useEffect(() => {
    if (!isProjectsInitialized) {
      initializeProjects();
    }
    if (!isSettingsInitialized) {
      initializeSettings();
    }
  }, [isProjectsInitialized, initializeProjects, isSettingsInitialized, initializeSettings]);

  // Workspace state
  const workspacesMap = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceByProject = useWorkspaceStore((s) => s.activeWorkspaceByProject);
  const getActiveWorkspace = useWorkspaceStore((s) => s.getActiveWorkspace);

  // Chat state
  const chatsMap = useChatStore((s) => s.chats);
  const activeChatByWorkspace = useChatStore((s) => s.activeChatByWorkspace);

  // Panel state - use individual selectors to avoid re-renders
  const closePanel = usePanelStore((s) => s.closePanel);
  const splitPanel = usePanelStore((s) => s.splitPanel);
  const spawnPanel = usePanelStore((s) => s.spawnPanel);
  const hasPanelType = usePanelStore((s) => s.hasPanelType);
  const getFocusedPanelId = usePanelStore((s) => s.getFocusedPanelId);
  const getFocusedPanel = usePanelStore((s) => s.getFocusedPanel);
  const focusNextPanel = usePanelStore((s) => s.focusNextPanel);
  const focusPrevPanel = usePanelStore((s) => s.focusPrevPanel);
  const duplicatePanel = usePanelStore((s) => s.duplicatePanel);
  const addTab = usePanelStore((s) => s.addTab);
  const closeTab = usePanelStore((s) => s.closeTab);
  const nextTab = usePanelStore((s) => s.nextTab);
  const prevTab = usePanelStore((s) => s.prevTab);

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

  // Dashboard state for home mode
  const dashboardActiveChatId = useDashboardStore((s) => s.activeChatId);

  // Home tab detection (shows all chats)
  const isHome = activeProjectId === HOME_PROJECT_ID;

  // Get the chat to display in home mode
  const homeActiveChat = useMemo(() => {
    if (!isHome || !dashboardActiveChatId) return undefined;
    return chatsMap.get(dashboardActiveChatId);
  }, [isHome, dashboardActiveChatId, chatsMap]);

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

  // Use refs for values that change frequently but shouldn't cause shortcut re-creation
  // This prevents re-renders when workspace/projects change
  const activeWorkspaceRef = useRef(activeWorkspace);
  activeWorkspaceRef.current = activeWorkspace;

  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  const isHomeRef = useRef(isHome);
  isHomeRef.current = isHome;

  // Keyboard shortcuts - stable array, handlers read from refs
  const shortcuts = useMemo(() => {
    // Helper to get current workspace ID from ref - use HOME_WORKSPACE_ID when on Home tab
    const getWsId = () => (isHomeRef.current ? HOME_WORKSPACE_ID : activeWorkspaceRef.current?.id);

    const items = [
      {
        key: "k",
        metaKey: true,
        shiftKey: false,
        handler: () => setCommandPaletteOpen(true),
        description: "Open command palette",
      },
      {
        key: "p",
        metaKey: true,
        shiftKey: true,
        handler: () => setProfileSwitcherOpen(true),
        description: "Open profile switcher",
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
          const wsId = getWsId();
          if (!wsId) return;
          const panel = getFocusedPanel(wsId);
          if (!panel) return;

          // If panel has tabs and more than one tab, close the active tab
          if (panel.tabs && panel.tabs.length > 1 && panel.activeTabId) {
            closeTab(wsId, panel.id, panel.activeTabId);
          } else {
            // Otherwise close the panel
            closePanel(wsId, panel.id);
          }
        },
        description: "Close current tab or panel",
      },
      {
        key: "\\",
        metaKey: true,
        shiftKey: true,
        handler: () => {
          const wsId = getWsId();
          if (!wsId) return;
          const panelId = getFocusedPanelId(wsId);
          if (panelId) {
            splitPanel(wsId, panelId, "horizontal", "empty");
          }
        },
        description: "Split panel right",
      },
      {
        key: "b",
        metaKey: true,
        shiftKey: true,
        handler: () => {
          const wsId = getWsId();
          if (!wsId) return;
          if (hasPanelType(wsId, "browser")) return;
          spawnPanel(wsId, "browser", { url: "https://google.com" });
        },
        description: "Open browser panel",
      },
      // Cmd+D: Duplicate focused panel type (horizontal split)
      {
        key: "d",
        metaKey: true,
        shiftKey: false,
        handler: () => {
          const wsId = getWsId();
          if (!wsId) return;
          const panelId = getFocusedPanelId(wsId);
          if (!panelId) return;
          duplicatePanel(wsId, panelId, "horizontal");
        },
        description: "Duplicate panel",
      },
      // Cmd+Shift+D: Duplicate focused panel type (vertical split)
      {
        key: "d",
        metaKey: true,
        shiftKey: true,
        handler: () => {
          const wsId = getWsId();
          if (!wsId) return;
          const panelId = getFocusedPanelId(wsId);
          if (!panelId) return;
          duplicatePanel(wsId, panelId, "vertical");
        },
        description: "Duplicate panel vertically",
      },
      // Cmd+T: Add new tab in tabbed panels
      {
        key: "t",
        metaKey: true,
        shiftKey: false,
        handler: () => {
          const wsId = getWsId();
          if (!wsId) return;
          const panelId = getFocusedPanelId(wsId);
          if (!panelId) return;
          addTab(wsId, panelId);
        },
        description: "New tab",
      },
      // Ctrl+Tab: Next tab
      {
        key: "Tab",
        metaKey: false,
        shiftKey: false,
        ctrlKey: true,
        handler: () => {
          const wsId = getWsId();
          if (!wsId) return;
          const panelId = getFocusedPanelId(wsId);
          if (!panelId) return;
          nextTab(wsId, panelId);
        },
        description: "Next tab",
      },
      // Ctrl+Shift+Tab: Previous tab
      {
        key: "Tab",
        metaKey: false,
        shiftKey: true,
        ctrlKey: true,
        handler: () => {
          const wsId = getWsId();
          if (!wsId) return;
          const panelId = getFocusedPanelId(wsId);
          if (!panelId) return;
          prevTab(wsId, panelId);
        },
        description: "Previous tab",
      },
      // Cmd+]: Focus next pane
      {
        key: "]",
        metaKey: true,
        shiftKey: false,
        handler: () => {
          const wsId = getWsId();
          if (!wsId) return;
          focusNextPanel(wsId);
        },
        description: "Focus next pane",
      },
      // Cmd+[: Focus previous pane
      {
        key: "[",
        metaKey: true,
        shiftKey: false,
        handler: () => {
          const wsId = getWsId();
          if (!wsId) return;
          focusPrevPanel(wsId);
        },
        description: "Focus previous pane",
      },
    ];

    // Number shortcuts for project switching (⌘1 = Home, ⌘2-9 = projects 1-8)
    items.push({
      key: "1",
      metaKey: true,
      shiftKey: false,
      handler: () => handleSelectProject(HOME_PROJECT_ID),
      description: "Switch to Home",
    });
    for (let i = 2; i <= 9; i += 1) {
      items.push({
        key: String(i),
        metaKey: true,
        shiftKey: false,
        handler: () => {
          const project = projectsRef.current[i - 2]; // ⌘2 = project[0], ⌘3 = project[1], etc.
          if (project) {
            handleSelectProject(project.id);
          }
        },
        description: `Switch to project ${i - 1}`,
      });
    }

    return items;
  }, [
    // Only stable dependencies - store methods don't change
    toggleSidebar,
    getFocusedPanelId,
    getFocusedPanel,
    closePanel,
    closeTab,
    splitPanel,
    spawnPanel,
    hasPanelType,
    focusNextPanel,
    focusPrevPanel,
    duplicatePanel,
    addTab,
    nextTab,
    prevTab,
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
        onCreateProject={() => setCreateProjectOpen(true)}
        onOpenProfileSettings={() => setView("settings")}
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
            workspaceId={isHome ? HOME_WORKSPACE_ID : activeWorkspace?.id}
            onNavigate={setView}
            currentView={view}
            isHome={isHome}
          />
        </Panel>
        <PanelResizeHandle className="w-1 bg-transparent hover:bg-accent/50 active:bg-accent transition-colors cursor-col-resize" />
        <Panel id="main" order={2} minSize={50}>
          <main className="h-full bg-background overflow-hidden flex flex-col">
            <div className="flex-1 overflow-hidden">
              {view === "settings" ? (
                <Settings />
              ) : isHome ? (
                // Home mode: always show PanelContainer (handles chat display + other panels)
                <PanelContainer workspaceId={HOME_WORKSPACE_ID} activeChatId={homeActiveChat?.id} />
              ) : activeWorkspace ? (
                <PanelContainer workspaceId={activeWorkspace.id} activeChatId={activeChat?.id} />
              ) : (
                <div className="flex-1 flex items-center justify-center h-full">
                  <div className="text-center max-w-md">
                    <h1 className="text-4xl font-bold mb-4">Welcome to kOS</h1>
                    <p className="text-muted-foreground mb-6 flex items-center justify-center gap-2">
                      <ProjectIcon icon={activeProject?.icon} size="lg" />
                      <span>{activeProject?.name || "No project selected"}</span>
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

      <ProfileSwitcherDialog open={profileSwitcherOpen} onOpenChange={setProfileSwitcherOpen} />

      {/* Project dialogs */}
      <ProjectCreateDialog open={createProjectOpen} onOpenChange={setCreateProjectOpen} />

      {settingsProjectId && projectsMap.get(settingsProjectId) && (
        <ProjectSettingsDialog
          project={projectsMap.get(settingsProjectId)!}
          open={true}
          onOpenChange={(open) => {
            if (!open) setSettingsProjectId(null);
          }}
        />
      )}
    </div>
  );
}
