import {
  Clock,
  Globe,
  Home,
  MessageSquare,
  Moon,
  Palette,
  PanelLeft,
  Plus,
  Settings,
  Sun,
  Monitor,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Chat, Project, View } from "../../types";
import { formatDistanceToNow } from "../../lib/date-utils";
import { ProjectIcon } from "../../lib/project-icons";
import { useChatStore } from "../../stores/chat-store";
import { usePanelStore } from "../../stores/panel-store";
import { useProjectStore } from "../../stores/project-store";
import { useThemeStore } from "../../stores/theme-store";
import { useWorkspaceStore } from "../../stores/workspace-store";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "../ui/command";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (view: View) => void;
  onToggleSidebar: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  onNavigate,
  onToggleSidebar,
}: CommandPaletteProps) {
  const [search, setSearch] = useState("");

  // Project store
  const projectsMap = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);

  // Workspace store
  const activeWorkspaceByProject = useWorkspaceStore((s) => s.activeWorkspaceByProject);

  // Panel store
  const spawnPanel = usePanelStore((s) => s.spawnPanel);
  const hasPanelType = usePanelStore((s) => s.hasPanelType);

  // Chat store
  const chatsMap = useChatStore((s) => s.chats);
  const setActiveChat = useChatStore((s) => s.setActiveChat);
  const addChat = useChatStore((s) => s.addChat);

  // Theme store
  const themes = useThemeStore((s) => s.themes);
  const activeThemeId = useThemeStore((s) => s.activeThemeId);
  const mode = useThemeStore((s) => s.mode);
  const setActiveTheme = useThemeStore((s) => s.setActiveTheme);
  const setMode = useThemeStore((s) => s.setMode);

  // Derived data
  const projects = useMemo(
    () =>
      Array.from(projectsMap.values() as Iterable<Project>).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [projectsMap],
  );

  const activeWorkspaceId = useMemo(() => {
    if (!activeProjectId) return null;
    return activeWorkspaceByProject.get(activeProjectId);
  }, [activeProjectId, activeWorkspaceByProject]);

  const recentChats = useMemo(() => {
    if (!activeWorkspaceId) return [];
    return Array.from(chatsMap.values() as Iterable<Chat>)
      .filter((c) => c.workspaceId === activeWorkspaceId && c.status !== "archived")
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
      .slice(0, 10);
  }, [chatsMap, activeWorkspaceId]);

  const otherProjects = useMemo(
    () => projects.filter((p) => p.id !== activeProjectId),
    [projects, activeProjectId],
  );

  // Reset search when dialog closes
  useEffect(() => {
    if (!open) {
      setSearch("");
    }
  }, [open]);

  const closeAndRun = useCallback(
    (fn: () => void) => {
      onOpenChange(false);
      setSearch("");
      fn();
    },
    [onOpenChange],
  );

  const handleNewChat = useCallback(() => {
    if (!activeWorkspaceId) return;
    closeAndRun(() => {
      const newChat = {
        id: `chat-${Date.now()}`,
        workspaceId: activeWorkspaceId,
        sessionKey: `sess-${Date.now()}`,
        title: "New Chat",
        status: "active" as const,
        lastMessageAt: Date.now(),
        createdAt: Date.now(),
      };
      addChat(newChat);
    });
  }, [closeAndRun, activeWorkspaceId, addChat]);

  const handleOpenBrowser = useCallback(() => {
    if (!activeWorkspaceId) return;
    closeAndRun(() => {
      spawnPanel(activeWorkspaceId, "browser", { url: "https://google.com" });
    });
  }, [closeAndRun, activeWorkspaceId, spawnPanel]);

  const browserAlreadyOpen = activeWorkspaceId ? hasPanelType(activeWorkspaceId, "browser") : false;

  const handleSelectChat = useCallback(
    (chatId: string, workspaceId: string) => {
      closeAndRun(() => {
        setActiveChat(workspaceId, chatId);
        onNavigate("home");
      });
    },
    [closeAndRun, setActiveChat, onNavigate],
  );

  const handleSelectProject = useCallback(
    (projectId: string) => {
      closeAndRun(() => {
        setActiveProject(projectId);
        onNavigate("home");
      });
    },
    [closeAndRun, setActiveProject, onNavigate],
  );

  const handleSelectTheme = useCallback(
    (themeId: string) => {
      closeAndRun(() => {
        setActiveTheme(themeId);
      });
    },
    [closeAndRun, setActiveTheme],
  );

  const handleSetMode = useCallback(
    (newMode: "light" | "dark" | "system") => {
      closeAndRun(() => {
        setMode(newMode);
      });
    },
    [closeAndRun, setMode],
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} showCloseButton={false}>
      <CommandInput
        placeholder="Type a command or search..."
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Actions */}
        <CommandGroup heading="Actions">
          <CommandItem onSelect={handleNewChat} disabled={!activeWorkspaceId}>
            <Plus className="mr-2 h-4 w-4" />
            <span>New Chat</span>
            <CommandShortcut>⌘N</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={handleOpenBrowser}
            disabled={!activeWorkspaceId || browserAlreadyOpen}
          >
            <Globe className="mr-2 h-4 w-4" />
            <span>{browserAlreadyOpen ? "Browser Open" : "Open Browser"}</span>
            <CommandShortcut>⌘⇧B</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              closeAndRun(() => {
                onNavigate("settings");
              })
            }
          >
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
            <CommandShortcut>⌘,</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              closeAndRun(() => {
                onToggleSidebar();
              })
            }
          >
            <PanelLeft className="mr-2 h-4 w-4" />
            <span>Toggle Sidebar</span>
            <CommandShortcut>⌘\</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              closeAndRun(() => {
                onNavigate("home");
              })
            }
          >
            <Home className="mr-2 h-4 w-4" />
            <span>Go Home</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Appearance */}
        <CommandGroup heading="Appearance">
          <CommandItem onSelect={() => handleSetMode(mode === "dark" ? "light" : "dark")}>
            {mode === "dark" ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
            <span>Toggle {mode === "dark" ? "Light" : "Dark"} Mode</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSetMode("system")}>
            <Monitor className="mr-2 h-4 w-4" />
            <span>Use System Theme</span>
            {mode === "system" && <CommandShortcut>✓</CommandShortcut>}
          </CommandItem>
        </CommandGroup>

        {/* Themes */}
        {themes.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Themes">
              {themes.map((theme) => (
                <CommandItem key={theme.id} onSelect={() => handleSelectTheme(theme.id)}>
                  <Palette className="mr-2 h-4 w-4" />
                  <span>{theme.name}</span>
                  {activeThemeId === theme.id && <CommandShortcut>✓</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Projects */}
        {otherProjects.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Switch Project">
              {otherProjects.map((project) => (
                <CommandItem key={project.id} onSelect={() => handleSelectProject(project.id)}>
                  <ProjectIcon icon={project.icon} className="mr-2" />
                  <span>{project.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Recent Chats */}
        {recentChats.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Recent Chats">
              {recentChats.map((chat) => (
                <CommandItem
                  key={chat.id}
                  value={`chat ${chat.title}`}
                  onSelect={() => chat.workspaceId && handleSelectChat(chat.id, chat.workspaceId)}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  <span className="flex-1 truncate">{chat.title}</span>
                  <span className="ml-2 flex items-center text-xs text-muted-foreground">
                    <Clock className="h-3 w-3 mr-1" />
                    {formatDistanceToNow(chat.lastMessageAt)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
