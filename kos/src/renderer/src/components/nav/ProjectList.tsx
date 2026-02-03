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

  // Settings modal state
  const [settingsProject, setSettingsProject] = useState<Project | null>(null);

  // Handle project click: expand to show threads, or show Linear board if no active thread
  const handleProjectClick = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);

    // Always toggle expansion to show/hide threads
    onProjectClick?.(projectId);

    // If no active thread and project has a Linear team, show the board
    if (!activeThreadId && project?.linearTeamId) {
      setSelectedProject(projectId);
    }
  };

  // Get threads grouped by project
  const threadsByProject = new Map<string, number>();
  const unsortedThreads: string[] = [];

  Array.from(threads.values()).forEach((thread) => {
    if (thread.status === "archived") return;

    if (thread.projectId) {
      threadsByProject.set(thread.projectId, (threadsByProject.get(thread.projectId) || 0) + 1);
    } else {
      unsortedThreads.push(thread.id);
    }
  });

  return (
    <>
      <div className="space-y-0.5">
        {/* Projects with threads */}
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
                      setSelectedProject(null);
                      onThreadClick?.();
                    }}
                    compact
                  />
                </div>
              )}
            </div>
          );
        })}

        {/* Unsorted threads section */}
        {unsortedThreads.length > 0 && (
          <div className="mt-6">
            <div className="px-3 py-2 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
              Unsorted
            </div>
            <div className="space-y-0.5">
              <ThreadList
                projectId={null}
                onThreadClick={() => {
                  setSelectedProject(null);
                  onThreadClick?.();
                }}
                compact
              />
            </div>
          </div>
        )}
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
