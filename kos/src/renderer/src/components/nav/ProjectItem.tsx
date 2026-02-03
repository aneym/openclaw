import { ChevronRight, ChevronDown, Settings } from "lucide-react";
import type { Project } from "../../types";
import { useProjectStore } from "../../stores/project-store";

interface ProjectItemProps {
  project: Project;
  threadCount: number;
  onClick?: () => void;
  onSettingsClick?: () => void;
}

export function ProjectItem({ project, threadCount, onClick, onSettingsClick }: ProjectItemProps) {
  const isExpanded = useProjectStore((s) => s.isExpanded(project.id));
  const toggleExpanded = useProjectStore((s) => s.toggleExpanded);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleExpanded(project.id);
  };

  const handleClick = () => {
    onClick?.();
  };

  const handleSettingsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSettingsClick?.();
  };

  return (
    <button
      onClick={handleClick}
      className="w-full px-3 py-2 rounded-lg text-left text-sm transition-all duration-200 flex items-center gap-2.5 hover:bg-accent/50 text-muted-foreground hover:text-foreground group"
    >
      {/* Expand/collapse chevron */}
      <button
        onClick={handleToggle}
        className="shrink-0 opacity-50 group-hover:opacity-100 transition-all duration-200"
      >
        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      {/* Project icon */}
      {project.icon && <span className="shrink-0 text-base leading-none">{project.icon}</span>}

      {/* Project name */}
      <span className="flex-1 truncate font-medium">{project.name}</span>

      {/* Thread count badge */}
      {threadCount > 0 && (
        <span className="shrink-0 px-2 py-0.5 text-xs font-medium rounded-full bg-muted text-muted-foreground transition-colors duration-200 group-hover:bg-muted/80">
          {threadCount}
        </span>
      )}

      {/* Settings button (visible on hover) */}
      <button
        onClick={handleSettingsClick}
        className="shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-all duration-200 rounded-md hover:bg-accent/30 p-0.5"
        title="Project settings"
      >
        <Settings className="h-3.5 w-3.5" />
      </button>
    </button>
  );
}
