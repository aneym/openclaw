import { GitBranch, Globe, ListTodo, Loader2, Plus, Settings, Terminal } from "lucide-react";
import { useMemo, useCallback } from "react";
import { toast } from "sonner";
import type { Chat, Project, View, Workspace } from "../../types";
import { loadMoreChats } from "../../hooks/use-session-sync";
import { CHAT_GROUPS, groupChatsByRecency, type ChatGroup } from "../../lib/chat-grouping";
import { notifications } from "../../lib/notifications";
import { sessionKeysMatch } from "../../lib/session-keys";
import { cn } from "../../lib/utils";
import { useChatStore } from "../../stores/chat-store";
import { useDashboardStore } from "../../stores/dashboard-store";
import { usePanelStore } from "../../stores/panel-store";
import { useProjectStore } from "../../stores/project-store";
import { useSidebarUIStore } from "../../stores/sidebar-ui-store";
import { useWorkspaceStore, HOME_WORKSPACE_ID } from "../../stores/workspace-store";
import { ChatGroupSection } from "./ChatGroupSection";
import { SessionSearch } from "./SessionSearch";

interface SidebarProps {
  projectId: string | null;
  workspaceId: string | undefined;
  onNavigate: (view: View) => void;
  currentView: View;
  isHome: boolean;
}

export function Sidebar({ projectId, workspaceId, onNavigate, currentView, isHome }: SidebarProps) {
  // Workspace state
  const workspacesMap = useWorkspaceStore((s) => s.workspaces);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const shouldShowWorkspaceUI = useWorkspaceStore((s) => s.shouldShowWorkspaceUI);

  // Chat state
  const chatsMap = useChatStore((s) => s.chats);
  const activeChatByWorkspace = useChatStore((s) => s.activeChatByWorkspace);
  const setActiveChat = useChatStore((s) => s.setActiveChat);
  const addChat = useChatStore((s) => s.addChat);
  const archiveChat = useChatStore((s) => s.archiveChat);
  const unarchiveChat = useChatStore((s) => s.unarchiveChat);
  const assignChatToProject = useChatStore((s) => s.assignChatToProject);

  // Project state
  const projectsMap = useProjectStore((s) => s.projects);

  // Dashboard state
  const dashboardFilter = useDashboardStore((s) => s.filter);
  const setDashboardFilter = useDashboardStore((s) => s.setFilter);
  const dashboardActiveChatId = useDashboardStore((s) => s.activeChatId);
  const setDashboardActiveChatId = useDashboardStore((s) => s.setActiveChatId);

  // Sidebar UI state - subscribe to raw data for reactivity
  const collapsedGroups = useSidebarUIStore((s) => s.collapsedGroups);
  const userToggledGroups = useSidebarUIStore((s) => s.userToggledGroups);
  const toggleGroup = useSidebarUIStore((s) => s.toggleGroup);

  // Panel state
  const spawnPanel = usePanelStore((s) => s.spawnPanel);
  const hasPanelType = usePanelStore((s) => s.hasPanelType);
  const openThreadInPane = usePanelStore((s) => s.openThreadInPane);
  const splitPaneWithThread = usePanelStore((s) => s.splitPaneWithThread);
  const getFocusedChatPanelId = usePanelStore((s) => s.getFocusedChatPanelId);

  // Pagination state
  const hasMore = useChatStore((s) => s.hasMore);
  const isLoadingMore = useChatStore((s) => s.isLoadingMore);

  // Derived values
  const showWorkspaces = !isHome && projectId ? shouldShowWorkspaceUI(projectId) : false;

  const workspaces = useMemo(() => {
    if (isHome || !projectId) return [];
    return Array.from(workspacesMap.values() as Iterable<Workspace>)
      .filter((w) => w.projectId === projectId)
      .sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [workspacesMap, projectId, isHome]);

  // All projects for assign-to-project menu
  const projects = useMemo(() => {
    return Array.from(projectsMap.values() as Iterable<Project>).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [projectsMap]);

  // Active project (for Linear integration)
  const activeProject = useMemo(() => {
    if (!projectId) return null;
    return projectsMap.get(projectId) || null;
  }, [projectsMap, projectId]);

  // Chats for the current context
  const allChats = useMemo(() => {
    return Array.from(chatsMap.values() as Iterable<Chat>).sort(
      (a, b) => b.lastMessageAt - a.lastMessageAt,
    );
  }, [chatsMap]);

  const chats = useMemo(() => {
    if (isHome) {
      // Dashboard mode: show all chats or unassigned based on filter
      if (dashboardFilter === "unassigned") {
        return allChats.filter((c) => !c.projectId);
      }
      return allChats;
    }

    // Project mode: show chats that belong to this project
    // Match by workspaceId OR by direct projectId assignment
    return allChats.filter((c) => {
      if (c.status === "archived") return false;
      if (workspaceId && c.workspaceId === workspaceId) return true;
      if (projectId && c.projectId === projectId) return true;
      return false;
    });
  }, [isHome, dashboardFilter, allChats, workspaceId, projectId]);

  // Grouped chats (for dashboard mode with grouping)
  const groupedChats = useMemo(() => {
    return groupChatsByRecency(chats);
  }, [chats]);

  // In home mode, use dashboard's active chat; in project mode, use workspace's active chat
  const activeChatId = isHome
    ? dashboardActiveChatId
    : workspaceId
      ? (activeChatByWorkspace.get(workspaceId) ?? null)
      : null;

  // Find which group contains the active chat (for auto-expand)
  const activeGroupKey = useMemo(() => {
    if (!activeChatId) return undefined;
    const prefix = isHome ? "dashboard" : "sidebar";
    for (const group of CHAT_GROUPS) {
      if (groupedChats[group as ChatGroup].some((c) => c.id === activeChatId)) {
        return `${prefix}-${group}`;
      }
    }
    return undefined;
  }, [activeChatId, isHome, groupedChats]);

  // Check if a group should be collapsed
  const isGroupCollapsed = (group: string) => {
    // If user has explicitly toggled this group, respect their choice
    if (userToggledGroups.has(group)) {
      return collapsedGroups.has(group);
    }
    // Default: collapse everything except the group containing the active chat
    return group !== activeGroupKey;
  };

  // Stable toggle handlers for each group (CHAT_GROUPS is fixed: Active, Older, Archived)
  const toggleHandlers = useMemo(
    () => ({
      "dashboard-Active": () => toggleGroup("dashboard-Active"),
      "dashboard-Older": () => toggleGroup("dashboard-Older"),
      "dashboard-Archived": () => toggleGroup("dashboard-Archived"),
      "sidebar-Active": () => toggleGroup("sidebar-Active"),
      "sidebar-Older": () => toggleGroup("sidebar-Older"),
      "sidebar-Archived": () => toggleGroup("sidebar-Archived"),
    }),
    [toggleGroup],
  );

  // Counts for dashboard filter
  const totalCount = allChats.length;
  const unassignedCount = allChats.filter((c) => !c.projectId).length;

  const handleSelectWorkspace = (wsId: string) => {
    if (projectId) {
      setActiveWorkspace(projectId, wsId);
    }
  };

  const handleSelectChat = useCallback(
    (chat: Chat, options?: { splitPane?: boolean }) => {
      if (isHome) {
        // In home mode, update dashboard state AND the focused panel
        setDashboardActiveChatId(chat.id);

        // Also update the focused chat panel's data.chatId so it renders the selected chat
        const focusedPanelId = getFocusedChatPanelId(HOME_WORKSPACE_ID);
        if (focusedPanelId) {
          if (options?.splitPane) {
            splitPaneWithThread(HOME_WORKSPACE_ID, focusedPanelId, chat.id);
          } else {
            openThreadInPane(HOME_WORKSPACE_ID, focusedPanelId, chat.id);
          }
        }

        onNavigate("home"); // Switch away from settings if open
        return;
      }

      // Project mode: need workspaceId to open
      const targetWorkspaceId = chat.workspaceId || workspaceId;
      if (!targetWorkspaceId) {
        notifications.error("Cannot open chat", "No workspace available. Select a project first.");
        return;
      }

      // If chat has no workspaceId, assign it to current workspace
      if (!chat.workspaceId && workspaceId) {
        const updatedChat: Chat = {
          ...chat,
          workspaceId,
          projectId: projectId ?? undefined,
        };
        const currentChatsMap = useChatStore.getState().chats;
        const updated = new Map(currentChatsMap);
        updated.set(chat.id, updatedChat);
        useChatStore.setState({ chats: updated });
      }

      // Handle split pane vs normal open
      if (options?.splitPane) {
        // Cmd+Click: Open in new split pane
        const focusedPanelId = getFocusedChatPanelId(targetWorkspaceId);
        if (focusedPanelId) {
          splitPaneWithThread(targetWorkspaceId, focusedPanelId, chat.id);
        }
      } else {
        // Normal click: Open in focused pane
        const focusedPanelId = getFocusedChatPanelId(targetWorkspaceId);
        if (focusedPanelId) {
          openThreadInPane(targetWorkspaceId, focusedPanelId, chat.id);
        }
      }

      // Also update the workspace's active chat (for backwards compatibility)
      setActiveChat(targetWorkspaceId, chat.id);
      onNavigate("home");
    },
    [
      isHome,
      workspaceId,
      projectId,
      onNavigate,
      setDashboardActiveChatId,
      getFocusedChatPanelId,
      splitPaneWithThread,
      openThreadInPane,
      setActiveChat,
    ],
  );

  const handleNewChat = () => {
    // Sessions are created implicitly when the first message is sent.
    // Generate a unique session key locally (matching web UI pattern).
    const uuid = crypto.randomUUID();
    const sessionKey = `kos:thread:${uuid}`;
    const now = Date.now();

    const newChat: Chat = {
      id: `chat-${now}`,
      workspaceId: isHome ? undefined : workspaceId,
      projectId: isHome ? undefined : (projectId ?? undefined),
      sessionKey,
      title: "New Chat",
      status: "active",
      lastMessageAt: now,
      createdAt: now,
    };

    console.log("[handleNewChat] Creating new chat", {
      chatId: newChat.id,
      sessionKey,
      isHome,
      workspaceId,
      projectId,
    });

    addChat(newChat);

    // Select the new chat and update the focused panel
    if (isHome) {
      console.log("[handleNewChat] Home mode - setting dashboard active chat");
      setDashboardActiveChatId(newChat.id);
      const focusedPanelId = getFocusedChatPanelId(HOME_WORKSPACE_ID);
      console.log("[handleNewChat] Focused panel ID:", focusedPanelId);
      if (focusedPanelId) {
        console.log("[handleNewChat] Opening thread in pane", {
          workspaceId: HOME_WORKSPACE_ID,
          panelId: focusedPanelId,
          chatId: newChat.id,
        });
        openThreadInPane(HOME_WORKSPACE_ID, focusedPanelId, newChat.id);
      } else {
        console.warn("[handleNewChat] No focused panel ID found!");
      }
    } else if (workspaceId) {
      console.log("[handleNewChat] Project mode - setting active chat");
      setActiveChat(workspaceId, newChat.id);
      const focusedPanelId = getFocusedChatPanelId(workspaceId);
      console.log("[handleNewChat] Focused panel ID:", focusedPanelId);
      if (focusedPanelId) {
        console.log("[handleNewChat] Opening thread in pane", {
          workspaceId,
          panelId: focusedPanelId,
          chatId: newChat.id,
        });
        openThreadInPane(workspaceId, focusedPanelId, newChat.id);
      } else {
        console.warn("[handleNewChat] No focused panel ID found!");
      }
      onNavigate("home");
    }
  };

  const handleArchiveChat = useCallback(
    (chatId: string) => {
      const chat = chatsMap.get(chatId);
      const chatTitle = chat?.title || "Chat";
      archiveChat(chatId);
      toast("Chat archived", {
        description: chatTitle,
        action: {
          label: "Undo",
          onClick: () => unarchiveChat(chatId),
        },
      });
    },
    [chatsMap, archiveChat, unarchiveChat],
  );

  const handleCopySessionId = useCallback((sessionKey: string) => {
    navigator.clipboard.writeText(sessionKey).catch(() => {
      notifications.error("Failed to copy session ID");
    });
  }, []);

  const handleAssignToProject = useCallback(
    (chatId: string, targetProjectId: string | null) => {
      assignChatToProject(chatId, targetProjectId);
    },
    [assignChatToProject],
  );

  // Handle session search result selection
  const handleSearchSelect = useCallback(
    (sessionKey: string) => {
      // Find the chat with this sessionKey
      const chat = allChats.find((c) => sessionKeysMatch(c.sessionKey, sessionKey));
      if (chat) {
        handleSelectChat(chat);
      } else {
        // Session not in local store - could create a new chat entry or show error
        notifications.info(
          "Session found",
          `Session ${sessionKey.slice(0, 8)}... - loading from server`,
        );
      }
    },
    [allChats, handleSelectChat],
  );

  return (
    <div className="h-full border-r border-border bg-muted/30 flex flex-col">
      {/* Session search */}
      <div className="shrink-0 border-b border-border px-3 py-2">
        <SessionSearch onSelectSession={handleSearchSelect} />
      </div>

      {/* Dashboard filter tabs */}
      {isHome && (
        <div className="shrink-0 border-b border-border px-3 py-2">
          <div className="flex gap-1">
            <FilterTab
              label="All"
              count={totalCount}
              isActive={dashboardFilter === "all"}
              onClick={() => setDashboardFilter("all")}
            />
            <FilterTab
              label="Unassigned"
              count={unassignedCount}
              isActive={dashboardFilter === "unassigned"}
              onClick={() => setDashboardFilter("unassigned")}
            />
          </div>
        </div>
      )}

      {/* Workspaces section (conditional, only in project mode) */}
      {showWorkspaces && (
        <div className="shrink-0 border-b border-border">
          <div className="px-4 py-2 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
            Workspaces
          </div>
          <div className="px-2 pb-2 space-y-0.5">
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => handleSelectWorkspace(ws.id)}
                className={cn(
                  "w-full px-3 py-1.5 rounded-md text-left text-sm transition-colors",
                  "flex items-center gap-2",
                  ws.id === workspaceId
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                )}
              >
                <GitBranch className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{ws.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chats section */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-4 py-2 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider flex items-center justify-between">
          <span>Chats</span>
          <button
            onClick={handleNewChat}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="New chat"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {chats.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">
              {isHome && dashboardFilter === "unassigned" ? "No unassigned chats" : "No chats yet"}
            </div>
          ) : isHome ? (
            // Dashboard mode: grouped chats with project badges
            <div className="space-y-2">
              {CHAT_GROUPS.map((group) => (
                <ChatGroupSection
                  key={group}
                  group={group as ChatGroup}
                  chats={groupedChats[group as ChatGroup]}
                  isCollapsed={isGroupCollapsed(`dashboard-${group}`)}
                  onToggle={toggleHandlers[`dashboard-${group}` as keyof typeof toggleHandlers]}
                  activeChatId={activeChatId}
                  onSelectChat={handleSelectChat}
                  onArchiveChat={handleArchiveChat}
                  onCopySessionId={handleCopySessionId}
                  projectsMap={projectsMap}
                  showProjectBadges={true}
                  projects={projects}
                  onAssignToProject={handleAssignToProject}
                />
              ))}
            </div>
          ) : (
            // Project mode: grouped chats without project badges
            <div className="space-y-2">
              {CHAT_GROUPS.map((group) => (
                <ChatGroupSection
                  key={group}
                  group={group as ChatGroup}
                  chats={groupedChats[group as ChatGroup]}
                  isCollapsed={isGroupCollapsed(`sidebar-${group}`)}
                  onToggle={toggleHandlers[`sidebar-${group}` as keyof typeof toggleHandlers]}
                  activeChatId={activeChatId}
                  onSelectChat={handleSelectChat}
                  onArchiveChat={handleArchiveChat}
                  onCopySessionId={handleCopySessionId}
                  projectsMap={projectsMap}
                  showProjectBadges={false}
                  projects={projects}
                  onAssignToProject={handleAssignToProject}
                />
              ))}
            </div>
          )}

          {/* Load more button */}
          {hasMore && (
            <button
              onClick={loadMoreChats}
              disabled={isLoadingMore}
              className={cn(
                "w-full mt-2 px-3 py-2 text-xs text-muted-foreground",
                "hover:text-foreground hover:bg-accent/50 rounded-md transition-colors",
                "flex items-center justify-center gap-2",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {isLoadingMore ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading...
                </>
              ) : (
                "Load older chats"
              )}
            </button>
          )}
        </div>
      </div>

      {/* Bottom nav */}
      <div className="shrink-0 border-t border-border px-2 py-2 space-y-0.5">
        <button
          onClick={() => {
            if (!workspaceId) return;
            if (hasPanelType(workspaceId, "tasks")) return;
            // projectId should always exist when in project view (not home)
            if (!projectId) return;
            spawnPanel(workspaceId, "tasks", {
              teamId: activeProject?.linearTeamId,
              projectId: projectId,
            });
          }}
          disabled={!workspaceId || !projectId || hasPanelType(workspaceId, "tasks")}
          title={
            !workspaceId || !projectId
              ? "Select a project first"
              : hasPanelType(workspaceId, "tasks")
                ? "Tasks already open"
                : "Open tasks panel"
          }
          className={cn(
            "w-full px-3 py-2 rounded-md text-left text-sm transition-colors",
            "flex items-center gap-2",
            "text-muted-foreground hover:text-foreground hover:bg-accent/50",
            "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent",
          )}
        >
          <ListTodo className="h-4 w-4 shrink-0" />
          <span>Tasks</span>
        </button>
        <button
          onClick={() => {
            if (!workspaceId) return;
            if (hasPanelType(workspaceId, "browser")) return;
            spawnPanel(workspaceId, "browser", { url: "https://google.com" });
          }}
          disabled={!workspaceId || (workspaceId ? hasPanelType(workspaceId, "browser") : false)}
          title={
            !workspaceId
              ? "Select a project first"
              : workspaceId && hasPanelType(workspaceId, "browser")
                ? "Browser already open"
                : "Open browser panel"
          }
          className={cn(
            "w-full px-3 py-2 rounded-md text-left text-sm transition-colors",
            "flex items-center gap-2",
            "text-muted-foreground hover:text-foreground hover:bg-accent/50",
            "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent",
          )}
        >
          <Globe className="h-4 w-4 shrink-0" />
          <span>Browser</span>
        </button>
        <button
          onClick={() => {
            if (!workspaceId) return;
            if (hasPanelType(workspaceId, "terminal")) return;
            spawnPanel(workspaceId, "terminal", {});
          }}
          disabled={!workspaceId || (workspaceId ? hasPanelType(workspaceId, "terminal") : false)}
          title={
            !workspaceId
              ? "Select a project first"
              : workspaceId && hasPanelType(workspaceId, "terminal")
                ? "Terminal already open"
                : "Open terminal panel"
          }
          className={cn(
            "w-full px-3 py-2 rounded-md text-left text-sm transition-colors",
            "flex items-center gap-2",
            "text-muted-foreground hover:text-foreground hover:bg-accent/50",
            "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent",
          )}
        >
          <Terminal className="h-4 w-4 shrink-0" />
          <span>Terminal</span>
        </button>
        <button
          onClick={() => onNavigate("settings")}
          className={cn(
            "w-full px-3 py-2 rounded-md text-left text-sm transition-colors",
            "flex items-center gap-2",
            currentView === "settings"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
          )}
        >
          <Settings className="h-4 w-4 shrink-0" />
          <span>Settings</span>
        </button>
      </div>
    </div>
  );
}

// Filter tab component for dashboard
function FilterTab({
  label,
  count,
  isActive,
  onClick,
}: {
  label: string;
  count: number;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 text-xs rounded-md transition-colors",
        isActive
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
      )}
    >
      {label}
      <span className="ml-1 text-muted-foreground/70">({count})</span>
    </button>
  );
}
