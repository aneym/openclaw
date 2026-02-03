import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import type { Tab } from "../../types";
import { useCreateThread } from "../../hooks/use-create-thread";
import { useKeyboardShortcuts } from "../../hooks/use-keyboard-shortcuts";
import { notifications } from "../../lib/notifications";
import { useGatewayStore } from "../../stores/gateway-store";
import { usePanelStore } from "../../stores/panel-store";
import { useProjectStore } from "../../stores/project-store";
import { useTabStore } from "../../stores/tab-store";
import { useThreadStore } from "../../stores/thread-store";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { LinearBoard } from "../linear/LinearBoard";
import { PanelContainer } from "../panels/PanelContainer";
import { Settings } from "../settings/Settings";
import { TabBar } from "../tabs/TabBar";
import { CommandPalette } from "./CommandPalette";
import { ProjectPicker } from "./ProjectPicker";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";

const SIDEBAR_STORAGE_KEY = "kos-sidebar-layout";

type View = "home" | "settings";

interface AgentEventPayload {
  runId: string;
  sessionKey?: string;
  stream: "lifecycle" | "tool" | "assistant" | "error" | string;
  ts: number;
  data: Record<string, unknown>;
}

function useTabStreaming(sessionKeysByTab: Map<string, string[]>) {
  const subscribe = useGatewayStore((s) => s.subscribe);
  const [streamingSessions, setStreamingSessions] = useState<Set<string>>(new Set());

  const sessionKeySet = useMemo(() => {
    const keys = new Set<string>();
    sessionKeysByTab.forEach((values) => {
      values.forEach((key) => keys.add(key));
    });
    return keys;
  }, [sessionKeysByTab]);

  useEffect(() => {
    if (streamingSessions.size === 0) return;
    setStreamingSessions((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((key) => {
        if (sessionKeySet.has(key)) {
          next.add(key);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [sessionKeySet, streamingSessions.size]);

  useEffect(() => {
    if (sessionKeySet.size === 0) return;

    const unsubscribe = subscribe("agent", (payload: unknown) => {
      const agentPayload = payload as AgentEventPayload;
      const sessionKey = agentPayload.sessionKey;

      if (!sessionKey || !sessionKeySet.has(sessionKey)) return;
      if (agentPayload.stream !== "lifecycle") return;

      const phase = agentPayload.data?.phase as string | undefined;
      if (!phase) return;

      setStreamingSessions((prev) => {
        const next = new Set(prev);
        if (phase === "start") {
          next.add(sessionKey);
        }
        if (phase === "end" || phase === "error") {
          next.delete(sessionKey);
        }
        return next;
      });
    });

    return unsubscribe;
  }, [subscribe, sessionKeySet]);

  return useMemo(() => {
    const map = new Map<string, boolean>();
    sessionKeysByTab.forEach((keys, tabId) => {
      map.set(
        tabId,
        keys.some((key) => streamingSessions.has(key)),
      );
    });
    return map;
  }, [sessionKeysByTab, streamingSessions]);
}

export function Shell() {
  const [view, setView] = useState<View>("home");
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const sidebarRef = useRef<ImperativePanelHandle>(null);
  const { createThread } = useCreateThread();
  // Track if this is initial mount - skip clearing logic on reload to preserve thread
  const isInitialMount = useRef(true);

  const toggleSidebar = useCallback(() => {
    const panel = sidebarRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }, []);

  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const workspaceConfigId = useWorkspaceStore((s) => s.config.activeWorkspaceId);
  const activeWorkspaceId = activeWorkspace?.id ?? workspaceConfigId ?? "default";
  const activeThreadId = useThreadStore((s) => s.activeThreadId);
  // Select raw Map to avoid calling method in selector (causes infinite loops)
  const threadsMap = useThreadStore((s) => s.threads);
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  // Select raw Map to avoid calling method in selector (causes infinite loops)
  const projectsMap = useProjectStore((s) => s.projects);
  const setSelectedProject = useProjectStore((s) => s.setSelectedProject);
  const tabsByWorkspace = useTabStore((s) => s.tabsByWorkspace);
  const activeTabIdByWorkspace = useTabStore((s) => s.activeTabIdByWorkspace);
  const selectedProjectIdByTab = useTabStore((s) => s.selectedProjectIdByTab);
  const openHomeTab = useTabStore((s) => s.openHomeTab);
  const openProjectTab = useTabStore((s) => s.openProjectTab);
  const closeTab = useTabStore((s) => s.closeTab);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const setTabActiveThread = useTabStore((s) => s.setActiveThread);

  const homeTabId = useMemo(() => `home-${activeWorkspaceId}`, [activeWorkspaceId]);
  const tabs = useMemo<Tab[]>(
    () => tabsByWorkspace[activeWorkspaceId] ?? [],
    [tabsByWorkspace, activeWorkspaceId],
  );
  const activeTabId = activeTabIdByWorkspace[activeWorkspaceId] ?? homeTabId;
  // Derive selectedProject outside selector with useMemo
  const selectedProject = useMemo(
    () => (selectedProjectId ? projectsMap.get(selectedProjectId) : undefined),
    [projectsMap, selectedProjectId],
  );
  const activeThread = useMemo(
    () => (activeThreadId ? threadsMap.get(activeThreadId) : undefined),
    [threadsMap, activeThreadId],
  );
  const setActiveThread = useThreadStore((s) => s.setActiveThread);
  const archiveThread = useThreadStore((s) => s.archiveThread);
  const splitPanel = usePanelStore((s) => s.splitPanel);
  const closePanel = usePanelStore((s) => s.closePanel);
  const getFocusedPanelId = usePanelStore((s) => s.getFocusedPanelId);
  const gatewayRequest = useGatewayStore((s) => s.request);
  const gatewayConnected = useGatewayStore((s) => s.connected);

  useEffect(() => {
    openHomeTab(activeWorkspaceId);
  }, [activeWorkspaceId, openHomeTab]);

  const activeTab = useMemo(() => {
    return tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  }, [tabs, activeTabId]);

  useEffect(() => {
    if (!selectedProjectId) return;
    if (activeTab?.projectId === selectedProjectId) return;
    const project = projectsMap.get(selectedProjectId);
    if (project && project.workspaceId === activeWorkspaceId) {
      openProjectTab(activeWorkspaceId, selectedProjectId);
    }
  }, [selectedProjectId, projectsMap, activeWorkspaceId, openProjectTab, activeTab?.projectId]);

  const threads = useMemo(
    () => Array.from(threadsMap.values()).filter((thread) => thread.status !== "archived"),
    [threadsMap],
  );

  const threadsByTab = useMemo(() => {
    const map = new Map<string, typeof threads>();
    tabs.forEach((tab) => {
      const scoped = threads.filter((thread) => thread.tabId === tab.id);
      scoped.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
      map.set(tab.id, scoped);
    });
    return map;
  }, [tabs, threads]);

  const sessionKeysByTab = useMemo(() => {
    const map = new Map<string, string[]>();
    threadsByTab.forEach((scopedThreads, tabId) => {
      map.set(
        tabId,
        scopedThreads.map((thread) => thread.sessionKey),
      );
    });
    return map;
  }, [threadsByTab]);

  const streamingByTabId = useTabStreaming(sessionKeysByTab);

  const tabsForBar = useMemo(
    () =>
      tabs.map((tab) =>
        tab.type === "home" ? { ...tab, icon: tab.icon ?? activeWorkspace?.icon ?? "🏠" } : tab,
      ),
    [tabs, activeWorkspace?.icon],
  );

  const tabsWithStreaming = useMemo(
    () =>
      tabsForBar.map((tab) => ({
        ...tab,
        isStreaming: streamingByTabId.get(tab.id) ?? false,
      })),
    [tabsForBar, streamingByTabId],
  );

  const activeThreadVisible = useMemo(() => {
    if (!activeThread || !activeTab) return false;
    return activeThread.tabId === activeTab.id;
  }, [activeThread, activeTab]);

  // Sync selected project when tab changes
  useEffect(() => {
    if (!activeTab) return;
    const tabSelectedProjectId =
      selectedProjectIdByTab[activeTab.id] ??
      (activeTab.type === "project" ? (activeTab.projectId ?? null) : null);

    if (tabSelectedProjectId !== selectedProjectId) {
      setSelectedProject(tabSelectedProjectId ?? null);
    }
  }, [activeTab, selectedProjectIdByTab, selectedProjectId, setSelectedProject]);

  // Restore thread selection when tab changes (separate effect to avoid loops)
  useEffect(() => {
    if (!activeTab) return;

    // Get current state directly from stores to avoid stale closures
    const currentActiveThreadId = useThreadStore.getState().activeThreadId;
    const currentThreadsMap = useThreadStore.getState().threads;
    const currentActiveThreadIdByTab = useTabStore.getState().activeThreadIdByTab;

    const storedThreadId = currentActiveThreadIdByTab[activeTab.id];
    const storedThread = storedThreadId ? currentThreadsMap.get(storedThreadId) : undefined;
    const resolvedThreadId =
      storedThread && storedThread.status !== "archived" && storedThread.tabId === activeTab.id
        ? storedThreadId
        : null;

    // Only update if we have a valid stored thread to restore
    if (resolvedThreadId && resolvedThreadId !== currentActiveThreadId) {
      setActiveThread(resolvedThreadId);
      // Also ensure tab store is in sync
      if (currentActiveThreadIdByTab[activeTab.id] !== resolvedThreadId) {
        setTabActiveThread(activeTab.id, resolvedThreadId);
      }
      return;
    }

    // On initial mount, skip clearing - let the tab-switching effect (below) handle
    // restoring the correct tab for the persisted thread instead of clearing it
    if (isInitialMount.current) {
      return;
    }

    // Clear active thread if it doesn't belong to this tab (manual tab switches only)
    const currentActiveThread = currentActiveThreadId
      ? currentThreadsMap.get(currentActiveThreadId)
      : undefined;
    if (
      currentActiveThreadId &&
      currentActiveThread &&
      currentActiveThread.tabId !== activeTab.id
    ) {
      setActiveThread(null);
    }
  }, [activeTab?.id, setActiveThread, setTabActiveThread]); // Only run when tab changes

  // Sync tab state when active thread changes
  useEffect(() => {
    // Mark initial mount as complete after first render cycle
    // This must happen in this effect because it needs to run AFTER the tab-switch
    // logic has had a chance to restore the correct tab for the persisted thread
    if (isInitialMount.current) {
      isInitialMount.current = false;
    }

    if (!activeThreadId) return;

    // Get current state directly from stores to avoid loops
    const currentThreadsMap = useThreadStore.getState().threads;
    const currentActiveThreadIdByTab = useTabStore.getState().activeThreadIdByTab;
    const currentActiveTabId =
      useTabStore.getState().activeTabIdByWorkspace[activeWorkspaceId] ?? homeTabId;

    const thread = currentThreadsMap.get(activeThreadId);
    if (!thread) return;

    if (currentActiveThreadIdByTab[thread.tabId] !== thread.id) {
      setTabActiveThread(thread.tabId, thread.id);
    }
    if (currentActiveTabId !== thread.tabId) {
      setActiveTab(thread.tabId);
    }
  }, [activeThreadId, activeWorkspaceId, homeTabId, setTabActiveThread, setActiveTab]);

  const handleSelectTab = useCallback(
    (tabId: string) => {
      setActiveTab(tabId);
      setView("home");
    },
    [setActiveTab, setView],
  );

  const handleCloseTab = useCallback(
    (tabId: string) => {
      closeTab(tabId);
    },
    [closeTab],
  );

  const handleCycleTab = useCallback(
    (direction: 1 | -1) => {
      if (tabs.length === 0) return;
      const currentIndex = tabs.findIndex((item) => item.id === activeTabId);
      const baseIndex = currentIndex === -1 ? 0 : currentIndex;
      const nextIndex = (baseIndex + direction + tabs.length) % tabs.length;
      handleSelectTab(tabs[nextIndex].id);
    },
    [tabs, activeTabId, handleSelectTab],
  );

  const handleSelectTabByIndex = useCallback(
    (index: number) => {
      const tab = tabs[index];
      if (tab) {
        handleSelectTab(tab.id);
      }
    },
    [tabs, handleSelectTab],
  );

  const handleSelectThreadByIndex = useCallback(
    (index: number) => {
      const threadsForTab = threadsByTab.get(activeTabId) ?? [];
      const thread = threadsForTab[index];
      if (thread) {
        setActiveThread(thread.id);
        setTabActiveThread(activeTabId, thread.id);
      }
    },
    [threadsByTab, activeTabId, setActiveThread, setTabActiveThread],
  );

  // Get the currently focused panel ID from the store
  // This is deterministic - tracks actual user focus via click events
  const findFocusedPanelId = (): string | null => {
    if (!activeThreadId) return null;
    return getFocusedPanelId(activeThreadId);
  };

  // Archive the active thread via gateway + local store
  const handleArchiveActiveThread = useCallback(async () => {
    if (!activeThread || !gatewayConnected) return;

    try {
      await gatewayRequest("sessions.patch", {
        key: activeThread.sessionKey,
        archived: true,
      });
      archiveThread(activeThread.id);
      notifications.sessionArchived(activeThread.sessionKey);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      notifications.rpcError("sessions.patch", message);
    }
  }, [activeThread, gatewayConnected, gatewayRequest, archiveThread]);

  // Keyboard shortcuts
  const shortcuts = useMemo(() => {
    const items = [
      {
        key: "t",
        metaKey: true,
        shiftKey: false,
        handler: () => setProjectPickerOpen(true),
        description: "Open project picker",
      },
      {
        key: "w",
        metaKey: true,
        shiftKey: false,
        handler: () => {
          if (!activeThreadId) return;
          const panelId = findFocusedPanelId();
          if (panelId) {
            closePanel(activeThreadId, panelId);
          }
        },
        description: "Close current panel",
      },
      {
        key: "w",
        metaKey: true,
        shiftKey: true,
        handler: () => handleCloseTab(activeTabId),
        description: "Close active tab",
      },
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
        key: "\\",
        metaKey: true,
        shiftKey: true,
        handler: () => {
          if (!activeThreadId) return;
          const panelId = findFocusedPanelId();
          if (panelId) {
            splitPanel(activeThreadId, panelId, "horizontal", "empty");
          }
        },
        description: "Split panel right",
      },
      {
        key: "|",
        metaKey: true,
        shiftKey: true,
        handler: () => {
          if (!activeThreadId) return;
          const panelId = findFocusedPanelId();
          if (panelId) {
            splitPanel(activeThreadId, panelId, "horizontal", "empty");
          }
        },
        description: "Split panel right",
      },
      {
        key: "Tab",
        ctrlKey: true,
        shiftKey: false,
        handler: () => handleCycleTab(1),
        description: "Next tab",
      },
      {
        key: "Tab",
        ctrlKey: true,
        shiftKey: true,
        handler: () => handleCycleTab(-1),
        description: "Previous tab",
      },
      {
        key: "e",
        metaKey: true,
        shiftKey: false,
        handler: () => void handleArchiveActiveThread(),
        description: "Archive active thread",
      },
    ];

    const shiftedNumberKeys = ["!", "@", "#", "$", "%", "^", "&", "*", "("];
    for (let i = 1; i <= 9; i += 1) {
      items.push({
        key: String(i),
        metaKey: true,
        shiftKey: false,
        handler: () => handleSelectTabByIndex(i - 1),
        description: `Switch to tab ${i}`,
      });
      items.push({
        key: shiftedNumberKeys[i - 1],
        metaKey: true,
        shiftKey: true,
        handler: () => handleSelectThreadByIndex(i - 1),
        description: `Switch to thread ${i}`,
      });
      items.push({
        key: String(i),
        metaKey: true,
        shiftKey: true,
        handler: () => handleSelectThreadByIndex(i - 1),
        description: `Switch to thread ${i}`,
      });
    }

    return items;
  }, [
    activeTabId,
    activeThreadId,
    setProjectPickerOpen,
    handleCloseTab,
    handleCycleTab,
    handleSelectTabByIndex,
    handleSelectThreadByIndex,
    closePanel,
    splitPanel,
    handleArchiveActiveThread,
    toggleSidebar,
  ]);

  useKeyboardShortcuts(shortcuts);

  return (
    <div className="h-screen flex flex-col">
      <PanelGroup direction="horizontal" autoSaveId={SIDEBAR_STORAGE_KEY} className="flex-1">
        <Panel
          ref={sidebarRef}
          id="sidebar"
          order={1}
          defaultSize={15}
          minSize={10}
          maxSize={30}
          collapsible
          collapsedSize={0}
        >
          <Sidebar onNavigate={setView} currentView={view} />
        </Panel>
        <PanelResizeHandle className="w-1 bg-transparent hover:bg-accent/50 active:bg-accent transition-colors cursor-col-resize" />
        <Panel id="main" order={2} minSize={50}>
          <main className="h-full bg-background overflow-hidden flex flex-col">
            {/* macOS titlebar drag region */}
            <div
              className="shrink-0 [-webkit-app-region:drag]"
              style={{ height: "var(--titlebar-height)" }}
            />
            <TabBar
              tabs={tabsWithStreaming}
              activeTabId={activeTabId}
              onSelectTab={handleSelectTab}
              onCloseTab={handleCloseTab}
            />
            <div className="flex-1 overflow-hidden">
              {view === "settings" ? (
                <Settings />
              ) : activeThreadVisible && activeThread ? (
                <PanelContainer threadId={activeThread.id} />
              ) : selectedProjectId &&
                selectedProject?.linearTeamId &&
                activeWorkspace?.linearApiKey ? (
                <div className="h-full overflow-auto">
                  <LinearBoard
                    projectId={selectedProjectId}
                    teamId={selectedProject.linearTeamId}
                    apiKey={activeWorkspace.linearApiKey}
                  />
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center h-full">
                  <div className="text-center max-w-md">
                    <h1 className="text-4xl font-bold mb-4">Welcome to kOS</h1>
                    <p className="text-muted-foreground mb-6">
                      {activeWorkspace?.icon || "🏠"} {activeWorkspace?.name || "Default Workspace"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Select a thread from the sidebar or create a new one to get started.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </main>
        </Panel>
      </PanelGroup>
      <StatusBar />
      <ProjectPicker
        open={projectPickerOpen}
        onOpenChange={setProjectPickerOpen}
        workspaceId={activeWorkspaceId}
        onSelectProject={() => setView("home")}
      />
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onNavigate={setView}
        onToggleSidebar={toggleSidebar}
        onNewThread={createThread}
        onOpenProjectPicker={() => setProjectPickerOpen(true)}
      />
    </div>
  );
}
