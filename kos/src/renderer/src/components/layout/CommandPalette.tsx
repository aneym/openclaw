import {
  Clock,
  FolderPlus,
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
import { formatDistanceToNow } from "../../lib/date-utils";
import { useProjectStore } from "../../stores/project-store";
import { useTabStore } from "../../stores/tab-store";
import { useThemeStore } from "../../stores/theme-store";
import { useThreadStore } from "../../stores/thread-store";
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
  onNavigate: (view: "home" | "settings") => void;
  onToggleSidebar: () => void;
  onNewThread: () => void;
  onOpenProjectPicker: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  onNavigate,
  onToggleSidebar,
  onNewThread,
  onOpenProjectPicker,
}: CommandPaletteProps) {
  const [search, setSearch] = useState("");

  // Workspace store
  const workspaces = useWorkspaceStore((s) => s.config.workspaces);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);

  // Thread store
  const threadsMap = useThreadStore((s) => s.threads);
  const setActiveThread = useThreadStore((s) => s.setActiveThread);

  // Project store
  const projectsMap = useProjectStore((s) => s.projects);

  // Tab store
  const openProjectTab = useTabStore((s) => s.openProjectTab);
  const openHomeTab = useTabStore((s) => s.openHomeTab);
  const setTabActiveThread = useTabStore((s) => s.setActiveThread);

  // Theme store
  const themes = useThemeStore((s) => s.themes);
  const activeThemeId = useThemeStore((s) => s.activeThemeId);
  const mode = useThemeStore((s) => s.mode);
  const setActiveTheme = useThemeStore((s) => s.setActiveTheme);
  const setMode = useThemeStore((s) => s.setMode);

  // Derived data
  const threads = useMemo(
    () =>
      Array.from(threadsMap.values())
        .filter((t) => t.status !== "archived")
        .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
        .slice(0, 10), // Limit to 10 recent threads
    [threadsMap],
  );

  const projects = useMemo(
    () =>
      Array.from(projectsMap.values())
        .filter((p) => p.workspaceId === activeWorkspace?.id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [projectsMap, activeWorkspace?.id],
  );

  const otherWorkspaces = useMemo(
    () => workspaces.filter((w) => w.id !== activeWorkspace?.id),
    [workspaces, activeWorkspace?.id],
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

  const handleSelectThread = useCallback(
    (threadId: string, tabId: string) => {
      closeAndRun(() => {
        setActiveThread(threadId);
        setTabActiveThread(tabId, threadId);
      });
    },
    [closeAndRun, setActiveThread, setTabActiveThread],
  );

  const handleSelectProject = useCallback(
    (projectId: string) => {
      if (!activeWorkspace) return;
      closeAndRun(() => {
        openProjectTab(activeWorkspace.id, projectId);
      });
    },
    [closeAndRun, activeWorkspace, openProjectTab],
  );

  const handleSwitchWorkspace = useCallback(
    (workspaceId: string) => {
      closeAndRun(() => {
        setActiveWorkspace(workspaceId);
        openHomeTab(workspaceId);
      });
    },
    [closeAndRun, setActiveWorkspace, openHomeTab],
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
          <CommandItem
            onSelect={() =>
              closeAndRun(() => {
                onNewThread();
              })
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            <span>New Thread</span>
            <CommandShortcut>⌘N</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              closeAndRun(() => {
                onOpenProjectPicker();
              })
            }
          >
            <FolderPlus className="mr-2 h-4 w-4" />
            <span>New Project Tab</span>
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

        {/* Workspaces */}
        {otherWorkspaces.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Switch Workspace">
              {otherWorkspaces.map((workspace) => (
                <CommandItem
                  key={workspace.id}
                  onSelect={() => handleSwitchWorkspace(workspace.id)}
                >
                  <span className="mr-2 text-base">{workspace.icon}</span>
                  <span>{workspace.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Projects */}
        {projects.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Projects">
              {projects.map((project) => (
                <CommandItem key={project.id} onSelect={() => handleSelectProject(project.id)}>
                  <span className="mr-2 text-base">{project.icon ?? "📁"}</span>
                  <span>{project.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Recent Threads */}
        {threads.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Recent Threads">
              {threads.map((thread) => (
                <CommandItem
                  key={thread.id}
                  value={`thread ${thread.title}`}
                  onSelect={() => handleSelectThread(thread.id, thread.tabId)}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  <span className="flex-1 truncate">{thread.title}</span>
                  <span className="ml-2 flex items-center text-xs text-muted-foreground">
                    <Clock className="h-3 w-3 mr-1" />
                    {formatDistanceToNow(thread.lastMessageAt)}
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
