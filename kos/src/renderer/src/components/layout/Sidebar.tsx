import { GitBranch, Globe, ListTodo, Loader2, Plus, Settings } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import type { Chat, Project, View, Workspace } from "../../types";
import { loadMoreChats } from "../../hooks/use-session-sync";
import { CHAT_GROUPS, groupChatsByRecency, type ChatGroup } from "../../lib/chat-grouping";
import { cn } from "../../lib/utils";
import { useChatStore } from "../../stores/chat-store";
import { useDashboardStore } from "../../stores/dashboard-store";
import { usePanelStore } from "../../stores/panel-store";
import { useProjectStore } from "../../stores/project-store";
import { useSidebarUIStore } from "../../stores/sidebar-ui-store";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { ChatGroupSection } from "./ChatGroupSection";

interface SidebarProps {
  projectId: string | null;
  workspaceId: string | undefined;
  onNavigate: (view: View) => void;
  currentView: View;
  isDashboard: boolean;
}

export function Sidebar({
  projectId,
  workspaceId,
  onNavigate,
  currentView,
  isDashboard,
}: SidebarProps) {
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
  const assignChatToProject = useChatStore((s) => s.assignChatToProject);

  // Project state
  const projectsMap = useProjectStore((s) => s.projects);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);

  // Dashboard state
  const dashboardFilter = useDashboardStore((s) => s.filter);
  const setDashboardFilter = useDashboardStore((s) => s.setFilter);

  // Sidebar UI state - subscribe to raw data for reactivity
  const collapsedGroups = useSidebarUIStore((s) => s.collapsedGroups);
  const userToggledGroups = useSidebarUIStore((s) => s.userToggledGroups);
  const toggleGroup = useSidebarUIStore((s) => s.toggleGroup);

  // Panel state
  const spawnPanel = usePanelStore((s) => s.spawnPanel);
  const hasPanelType = usePanelStore((s) => s.hasPanelType);

  // Pagination state
  const hasMore = useChatStore((s) => s.hasMore);
  const isLoadingMore = useChatStore((s) => s.isLoadingMore);

  // Derived values
  const showWorkspaces = !isDashboard && projectId ? shouldShowWorkspaceUI(projectId) : false;

  const workspaces = useMemo(() => {
    if (isDashboard || !projectId) return [];
    return Array.from(workspacesMap.values() as Iterable<Workspace>)
      .filter((w) => w.projectId === projectId)
      .sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [workspacesMap, projectId, isDashboard]);

  // All projects for assign-to-project menu
  const projects = useMemo(() => {
    return Array.from(projectsMap.values() as Iterable<Project>).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [projectsMap]);

  // Chats for the current context
  const allChats = useMemo(() => {
    const chats = Array.from(chatsMap.values() as Iterable<Chat>).sort(
      (a, b) => b.lastMessageAt - a.lastMessageAt,
    );
    // Log unique workspaceIds and projectIds to understand the data
    const workspaceIds = new Set(chats.map((c) => c.workspaceId).filter(Boolean));
    const projectIds = new Set(chats.map((c) => c.projectId).filter(Boolean));
    console.log("[Sidebar] allChats analysis:", {
      total: chats.length,
      uniqueWorkspaceIds: Array.from(workspaceIds),
      uniqueProjectIds: Array.from(projectIds),
    });
    return chats;
  }, [chatsMap]);

  const chats = useMemo(() => {
    console.log("[Sidebar] Filtering chats:", {
      isDashboard,
      dashboardFilter,
      projectId,
      workspaceId,
      totalChats: allChats.length,
    });

    if (isDashboard) {
      // Dashboard mode: show all chats or unassigned based on filter
      if (dashboardFilter === "unassigned") {
        const filtered = allChats.filter((c) => !c.projectId);
        console.log("[Sidebar] Dashboard unassigned mode:", filtered.length);
        return filtered;
      }
      console.log("[Sidebar] Dashboard all mode:", allChats.length);
      return allChats;
    }

    // Project mode: show chats that belong to this project
    // Match by workspaceId OR by direct projectId assignment
    const filtered = allChats.filter((c) => {
      if (c.status === "archived") return false;
      if (workspaceId && c.workspaceId === workspaceId) return true;
      if (projectId && c.projectId === projectId) return true;
      return false;
    });

    // Log why chats are matching
    const matchingByWorkspace = allChats.filter(
      (c) => workspaceId && c.workspaceId === workspaceId,
    ).length;
    const matchingByProject = allChats.filter((c) => projectId && c.projectId === projectId).length;
    console.log("[Sidebar] Project mode filtered:", {
      projectId,
      workspaceId,
      filteredCount: filtered.length,
      matchingByWorkspace,
      matchingByProject,
      sampleChats: filtered.slice(0, 3).map((c) => ({
        id: c.id,
        workspaceId: c.workspaceId,
        projectId: c.projectId,
      })),
    });

    return filtered;
  }, [isDashboard, dashboardFilter, allChats, workspaceId, projectId]);

  // Grouped chats (for dashboard mode with grouping)
  const groupedChats = useMemo(() => {
    return groupChatsByRecency(chats);
  }, [chats]);

  const activeChatId = workspaceId ? (activeChatByWorkspace.get(workspaceId) ?? null) : null;

  // Find which group contains the active chat (for auto-expand)
  const activeGroupKey = useMemo(() => {
    if (!activeChatId) return undefined;
    const prefix = isDashboard ? "dashboard" : "sidebar";
    for (const group of CHAT_GROUPS) {
      if (groupedChats[group as ChatGroup].some((c) => c.id === activeChatId)) {
        return `${prefix}-${group}`;
      }
    }
    return undefined;
  }, [activeChatId, isDashboard, groupedChats]);

  // Check if a group should be collapsed
  const isGroupCollapsed = (group: string) => {
    // If user has explicitly toggled this group, respect their choice
    if (userToggledGroups.has(group)) {
      return collapsedGroups.has(group);
    }
    // Default: collapse everything except the group containing the active chat
    return group !== activeGroupKey;
  };

  // Counts for dashboard filter
  const totalCount = allChats.length;
  const unassignedCount = allChats.filter((c) => !c.projectId).length;

  const handleSelectWorkspace = (wsId: string) => {
    if (projectId) {
      setActiveWorkspace(projectId, wsId);
    }
  };

  const handleSelectChat = (chat: Chat) => {
    if (isDashboard) {
      // In dashboard mode, navigate to the chat's project
      if (chat.workspaceId && chat.projectId) {
        // Switch to the chat's project, set it active, then navigate
        setActiveProject(chat.projectId);
        setActiveChat(chat.workspaceId, chat.id);
        onNavigate("home");
      } else if (chat.workspaceId) {
        // Has workspace but no project - still try to open
        setActiveChat(chat.workspaceId, chat.id);
        onNavigate("home");
      } else {
        // Unassigned chats: show a toast prompting assignment
        toast.info("Assign this chat to a project first", {
          description: "Unassigned chats need to be assigned to a project before opening.",
        });
      }
      return;
    }

    // Project mode: need workspaceId to open
    if (chat.workspaceId) {
      setActiveChat(chat.workspaceId, chat.id);
      onNavigate("home");
    } else if (workspaceId) {
      // Chat has no workspaceId but we have an active workspace - assign and open
      // Update chat with current workspace, then select it
      const updatedChat: Chat = {
        ...chat,
        workspaceId,
        projectId: projectId ?? undefined,
      };
      // Update the chat in the store
      const chatsMap = useChatStore.getState().chats;
      const updated = new Map(chatsMap);
      updated.set(chat.id, updatedChat);
      useChatStore.setState({ chats: updated });
      // Now set it as active
      setActiveChat(workspaceId, chat.id);
      onNavigate("home");
    } else {
      toast.error("Cannot open chat", {
        description: "No workspace available. Select a project first.",
      });
    }
  };

  const handleNewChat = () => {
    if (isDashboard) {
      // Create unassigned chat in dashboard mode
      const newChat: Chat = {
        id: `chat-${Date.now()}`,
        sessionKey: `sess-${Date.now()}`,
        title: "New Chat",
        status: "active",
        lastMessageAt: Date.now(),
        createdAt: Date.now(),
      };
      addChat(newChat);
      return;
    }

    if (!workspaceId) return;
    const newChat: Chat = {
      id: `chat-${Date.now()}`,
      workspaceId,
      projectId: projectId ?? undefined,
      sessionKey: `sess-${Date.now()}`,
      title: "New Chat",
      status: "active",
      lastMessageAt: Date.now(),
      createdAt: Date.now(),
    };
    addChat(newChat);
  };

  const handleArchiveChat = (chatId: string) => {
    archiveChat(chatId);
  };

  const handleCopySessionId = (sessionKey: string) => {
    navigator.clipboard.writeText(sessionKey).catch(() => {
      toast.error("Failed to copy session ID");
    });
  };

  const handleAssignToProject = (chatId: string, targetProjectId: string | null) => {
    assignChatToProject(chatId, targetProjectId);
  };

  return (
    <div className="h-full border-r border-border bg-muted/30 flex flex-col">
      {/* Dashboard filter tabs */}
      {isDashboard && (
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
              {isDashboard && dashboardFilter === "unassigned"
                ? "No unassigned chats"
                : "No chats yet"}
            </div>
          ) : isDashboard ? (
            // Dashboard mode: grouped chats with project badges
            <div className="space-y-2">
              {CHAT_GROUPS.map((group) => (
                <ChatGroupSection
                  key={group}
                  group={group as ChatGroup}
                  chats={groupedChats[group as ChatGroup]}
                  isCollapsed={isGroupCollapsed(`dashboard-${group}`)}
                  onToggle={() => toggleGroup(`dashboard-${group}`)}
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
                  onToggle={() => toggleGroup(`sidebar-${group}`)}
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
          onClick={() => onNavigate("home")}
          className={cn(
            "w-full px-3 py-2 rounded-md text-left text-sm transition-colors",
            "flex items-center gap-2",
            currentView === "home" && !activeChatId
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
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
