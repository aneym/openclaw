import { useState } from 'react'
import { ProjectItem } from './ProjectItem'
import { ProjectSettings } from './ProjectSettings'
import { ThreadList } from '../threads/ThreadList'
import { useProjectStore } from '../../stores/project-store'
import { useThreadStore } from '../../stores/thread-store'
import { useWorkspaceStore } from '../../stores/workspace-store'
import type { Project } from '../../types'

interface ProjectListProps {
  onThreadClick?: () => void
  onProjectClick?: (projectId: string) => void
}

export function ProjectList({ onThreadClick, onProjectClick }: ProjectListProps) {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace)
  const projects = useProjectStore((s) =>
    activeWorkspace ? s.getProjectsByWorkspace(activeWorkspace.id) : []
  )
  const isExpanded = useProjectStore((s) => s.isExpanded)
  const threads = useThreadStore((s) => s.threads)

  // Settings modal state
  const [settingsProject, setSettingsProject] = useState<Project | null>(null)

  // Get threads grouped by project
  const threadsByProject = new Map<string, number>()
  const unsortedThreads: string[] = []

  Array.from(threads.values()).forEach((thread) => {
    if (thread.status === 'archived') return

    if (thread.projectId) {
      threadsByProject.set(
        thread.projectId,
        (threadsByProject.get(thread.projectId) || 0) + 1
      )
    } else {
      unsortedThreads.push(thread.id)
    }
  })

  return (
    <>
      <div className="space-y-1">
        {/* Projects with threads */}
        {projects.map((project) => {
          const count = threadsByProject.get(project.id) || 0
          const expanded = isExpanded(project.id)

          return (
            <div key={project.id}>
              <ProjectItem
                project={project}
                threadCount={count}
                onClick={() => onProjectClick?.(project.id)}
                onSettingsClick={() => setSettingsProject(project)}
              />
              {expanded && count > 0 && (
                <div className="ml-6 mt-1 space-y-1">
                  <ThreadList
                    projectId={project.id}
                    onThreadClick={onThreadClick}
                    compact
                  />
                </div>
              )}
            </div>
          )
        })}

        {/* Unsorted threads section */}
        {unsortedThreads.length > 0 && (
          <div className="mt-4">
            <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Unsorted
            </div>
            <ThreadList projectId={null} onThreadClick={onThreadClick} compact />
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
  )
}
