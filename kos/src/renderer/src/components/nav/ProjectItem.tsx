import { ChevronRight, ChevronDown, Settings } from 'lucide-react'
import type { Project } from '../../types'
import { useProjectStore } from '../../stores/project-store'

interface ProjectItemProps {
  project: Project
  threadCount: number
  onClick?: () => void
  onSettingsClick?: () => void
}

export function ProjectItem({ project, threadCount, onClick, onSettingsClick }: ProjectItemProps) {
  const isExpanded = useProjectStore((s) => s.isExpanded(project.id))
  const toggleExpanded = useProjectStore((s) => s.toggleExpanded)

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    toggleExpanded(project.id)
  }

  const handleClick = () => {
    onClick?.()
  }

  const handleSettingsClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSettingsClick?.()
  }

  return (
    <button
      onClick={handleClick}
      className="w-full px-3 py-2 rounded-md text-left text-sm transition-colors flex items-center gap-2 hover:bg-accent/50 text-muted-foreground hover:text-foreground group"
    >
      {/* Expand/collapse chevron */}
      <button
        onClick={handleToggle}
        className="shrink-0 opacity-60 group-hover:opacity-100"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>

      {/* Project icon */}
      {project.icon && <span className="shrink-0 text-base">{project.icon}</span>}

      {/* Project name */}
      <span className="flex-1 truncate">{project.name}</span>

      {/* Thread count badge */}
      {threadCount > 0 && (
        <span className="shrink-0 px-1.5 py-0.5 text-xs rounded-full bg-muted text-muted-foreground">
          {threadCount}
        </span>
      )}

      {/* Settings button (visible on hover) */}
      <button
        onClick={handleSettingsClick}
        className="shrink-0 opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity"
        title="Project settings"
      >
        <Settings className="h-3.5 w-3.5" />
      </button>
    </button>
  )
}
