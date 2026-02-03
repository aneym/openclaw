import { Plus, Settings } from "lucide-react";
import type { Project } from "../../types";
import { cn } from "../../lib/utils";

interface ProjectTabsProps {
  projects: Project[];
  activeProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onSettings: () => void;
}

export function ProjectTabs({
  projects,
  activeProjectId,
  onSelectProject,
  onSettings,
}: ProjectTabsProps) {
  return (
    <div className="flex items-center h-10 border-b border-border bg-muted/30 px-2 gap-1 [-webkit-app-region:drag]">
      <div className="flex items-center gap-1 [-webkit-app-region:no-drag]">
        {projects.map((project) => (
          <button
            key={project.id}
            onClick={() => onSelectProject(project.id)}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              "flex items-center gap-2",
              project.id === activeProjectId
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50",
            )}
          >
            <span>{project.icon || "📁"}</span>
            <span>{project.name}</span>
          </button>
        ))}
        <button
          className={cn(
            "px-2 py-1.5 rounded-md text-muted-foreground",
            "hover:text-foreground hover:bg-background/50 transition-colors",
          )}
          title="Add project"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1" />

      <button
        onClick={onSettings}
        className={cn(
          "px-2 py-1.5 rounded-md text-muted-foreground [-webkit-app-region:no-drag]",
          "hover:text-foreground hover:bg-background/50 transition-colors",
        )}
        title="Settings"
      >
        <Settings className="h-4 w-4" />
      </button>
    </div>
  );
}
