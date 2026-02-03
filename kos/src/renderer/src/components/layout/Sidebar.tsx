import { Archive, Copy, GitBranch, ListTodo, MessageSquare, Plus, Settings } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import type { Chat, Workspace } from "../../types";
import { cn } from "../../lib/utils";
import { useChatStore } from "../../stores/chat-store";
import { useWorkspaceStore } from "../../stores/workspace-store";

type View = "home" | "settings";

interface SidebarProps {
  projectId: string | null;
  workspaceId: string | undefined;
  onNavigate: (view: View) => void;
  currentView: View;
}

export function Sidebar({ projectId, workspaceId, onNavigate, currentView }: SidebarProps) {
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

  // Derived values
  const showWorkspaces = projectId ? shouldShowWorkspaceUI(projectId) : false;

  const workspaces = useMemo(() => {
    if (!projectId) return [];
    return Array.from(workspacesMap.values() as Iterable<Workspace>)
      .filter((w) => w.projectId === projectId)
      .sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [workspacesMap, projectId]);

  const chats = useMemo(() => {
    if (!workspaceId) return [];
    return Array.from(chatsMap.values() as Iterable<Chat>)
      .filter((c) => c.workspaceId === workspaceId && c.status !== "archived")
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  }, [chatsMap, workspaceId]);

  const activeChatId = workspaceId ? activeChatByWorkspace.get(workspaceId) : null;

  const handleSelectWorkspace = (wsId: string) => {
    if (projectId) {
      setActiveWorkspace(projectId, wsId);
    }
  };

  const handleSelectChat = (chatId: string) => {
    if (workspaceId) {
      setActiveChat(workspaceId, chatId);
      onNavigate("home");
    }
  };

  const handleNewChat = () => {
    if (!workspaceId) return;
    const newChat = {
      id: `chat-${Date.now()}`,
      workspaceId,
      sessionKey: `sess-${Date.now()}`,
      title: "New Chat",
      status: "active" as const,
      lastMessageAt: Date.now(),
      createdAt: Date.now(),
    };
    addChat(newChat);
  };

  const handleCopySessionId = (e: React.MouseEvent, sessionKey: string) => {
    e.stopPropagation();
    navigator.clipboard
      .writeText(sessionKey)
      .then(() => {
        toast.success("Session ID copied to clipboard");
      })
      .catch(() => {
        toast.error("Failed to copy session ID");
      });
  };

  const handleArchiveChat = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    archiveChat(chatId);
    toast.success("Chat archived");
  };

  return (
    <div className="h-full border-r border-border bg-muted/30 flex flex-col">
      {/* Workspaces section (conditional) */}
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
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">No chats yet</div>
          ) : (
            <div className="space-y-0.5">
              {chats.map((chat) => (
                <div
                  key={chat.id}
                  className={cn(
                    "group w-full px-3 py-2 rounded-md text-left text-sm transition-colors",
                    "flex items-center gap-2 relative cursor-pointer",
                    chat.id === activeChatId
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                  )}
                  onClick={() => handleSelectChat(chat.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSelectChat(chat.id);
                    }
                  }}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{chat.title}</div>
                    {chat.subtitle && (
                      <div className="text-xs text-muted-foreground truncate">{chat.subtitle}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => handleArchiveChat(e, chat.id)}
                      className={cn("shrink-0 p-1 rounded-sm", "hover:bg-accent-foreground/10")}
                      title="Archive chat"
                    >
                      <Archive className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => handleCopySessionId(e, chat.sessionKey)}
                      className={cn("shrink-0 p-1 rounded-sm", "hover:bg-accent-foreground/10")}
                      title="Copy session ID"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
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
