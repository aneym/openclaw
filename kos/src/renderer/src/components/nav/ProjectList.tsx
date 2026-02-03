import { useMemo, useState } from "react";
import type { Project } from "../../types";
import { useProjectStore } from "../../stores/project-store";
import { useThreadStore } from "../../stores/thread-store";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { ThreadList } from "../threads/ThreadList";
import { ProjectItem } from "./ProjectItem";
import { ProjectSettings } from "./ProjectSettings";

interface ProjectListProps {
  onThreadClick?: () => void;
  onProjectClick?: (projectId: string) => void;
}

export function ProjectList({ onThreadClick, onProjectClick }: ProjectListProps) {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const projectsMap = useProjectStore((s) => s.projects);

  // Memoize the filtered/sorted projects to avoid infinite loop
  const projects = useMemo(() => {
    if (!activeWorkspace) return [];
    return Array.from(projectsMap.values())
      .filter((p) => p.workspaceId === activeWorkspace.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projectsMap, activeWorkspace?.id]);
  // Select raw Set to avoid calling method in selector (causes infinite loops)
  const expandedIds = useProjectStore((s) => s.expandedProjectIds);
  const setSelectedProject = useProjectStore((s) => s.setSelectedProject);
  const threads = useThreadStore((s) => s.threads);
  const activeThreadId = useThreadStore((s) => s.activeThreadId);
  const setActiveThread = useThreadStore((s) => s.setActiveThread);

  // Settings modal state
  const [settingsProject, setSettingsProject] = useState<Project | null>(null);

  // Handle project click: open/focus the project tab
  const handleProjectClick = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    const activeThread = activeThreadId ? threads.get(activeThreadId) : null;
    const activeThreadInProject =
      activeThread?.projectId === projectId && activeThread.status !== "archived";
    const hasBoard = !!(project?.linearTeamId && activeWorkspace?.linearApiKey);
    const projectThreads = Array.from(threads.values()).filter(
      (thread) => thread.projectId === projectId && thread.status !== "archived",
    );
    const latestThread = projectThreads.sort((a, b) => b.lastMessageAt - a.lastMessageAt)[0];

    // Preserve existing hooks while routing to the project tab
    onProjectClick?.(projectId);
    onThreadClick?.();

    setSelectedProject(projectId);

    // If we're already focused on this project's thread, keep it as-is.
    if (activeThreadInProject) {
      return;
    }

    // Focus the most recent thread in this project when available.
    if (latestThread) {
      setActiveThread(latestThread.id);
      return;
    }

    // No threads available — show the board if possible, otherwise the empty state.
    if (activeThreadId) {
      useThreadStore.setState({ activeThreadId: null });
    }
    if (hasBoard) {
      return;
    }
  };

  // Get thread count per project (for the project item badge)
  const threadsByProject = useMemo(() => {
    const counts = new Map<string, number>();
    Array.from(threads.values()).forEach((thread) => {
      if (thread.status === "archived") return;
      if (thread.sessionKey?.startsWith("cron:")) return;
      if (thread.projectId) {
        counts.set(thread.projectId, (counts.get(thread.projectId) || 0) + 1);
      }
    });
    return counts;
  }, [threads]);

  return (
    <>
      <div className="space-y-0.5">
        {/* Projects list (just shows project items, no thread sublists) */}
        {projects.map((project) => {
          const count = threadsByProject.get(project.id) || 0;
          const expanded = expandedIds.has(project.id);

          return (
            <div key={project.id} className="space-y-0.5">
              <ProjectItem
                project={project}
                threadCount={count}
                onClick={() => handleProjectClick(project.id)}
                onSettingsClick={() => setSettingsProject(project)}
              />
              {expanded && count > 0 && (
                <div className="ml-4 space-y-0.5 animate-in fade-in slide-in-from-top-1 duration-200">
                  <ThreadList
                    projectId={project.id}
                    onThreadClick={() => {
                      setSelectedProject(project.id);
                      onThreadClick?.();
                    }}
                    compact
                  />
                </div>
              )}
            </div>
          );
        })}

        {/* All threads grouped by Active/Older/Automated/Archived */}
        <div className="mt-6">
          <ThreadList
            onThreadClick={() => {
              setSelectedProject(null);
              onThreadClick?.();
            }}
          />
        </div>
      </div>

      {/* Project Settings Sheet */}
      {settingsProject && (
        <ProjectSettings
          project={settingsProject}
          open={!!settingsProject}
          onOpenChange={(open) => !open && setSettingsProject(null)}
        />
      )}
    </>
  );
}
