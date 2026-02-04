import { Home, Plus, Settings as SettingsIcon } from "lucide-react";
import type { Project } from "../../types";
import { ProjectIcon } from "../../lib/project-icons";
import { cn } from "../../lib/utils";
import { ProfileSwitcher } from "./ProfileSwitcher";

export const HOME_PROJECT_ID = "__home__";

interface ProjectTabsProps {
  projects: Project[];
  activeProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onSettings: () => void;
  onCreateProject: () => void;
  onProjectSettings?: (projectId: string) => void;
  onOpenProfileSettings?: () => void;
  onCreateProfile?: () => void;
}

export function ProjectTabs({
  projects,
  activeProjectId,
  onSelectProject,
  onSettings,
  onCreateProject,
  onOpenProfileSettings,
  onCreateProfile,
}: ProjectTabsProps) {
  const isHomeActive = activeProjectId === HOME_PROJECT_ID;

  return (
    <div className="flex items-center h-10 border-b border-border bg-muted/30 px-2 gap-1 [-webkit-app-region:drag]">
      <div className="flex items-center gap-1 [-webkit-app-region:no-drag]">
        {/* Home tab */}
        <button
          onClick={() => onSelectProject(HOME_PROJECT_ID)}
          className={cn(
            "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
            "flex items-center gap-2",
            isHomeActive
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-background/50",
          )}
        >
          <Home className="h-4 w-4" />
          <span>Home</span>
        </button>

        {/* Project tabs */}
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
            <ProjectIcon icon={project.icon} size="sm" />
            <span>{project.name}</span>
          </button>
        ))}
        <button
          onClick={onCreateProject}
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

      <div className="flex items-center gap-1 [-webkit-app-region:no-drag]">
        <ProfileSwitcher onOpenSettings={onOpenProfileSettings} onCreateProfile={onCreateProfile} />
        <button
          onClick={onSettings}
          className={cn(
            "px-2 py-1.5 rounded-md text-muted-foreground",
            "hover:text-foreground hover:bg-background/50 transition-colors",
          )}
          title="Settings"
        >
          <SettingsIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
