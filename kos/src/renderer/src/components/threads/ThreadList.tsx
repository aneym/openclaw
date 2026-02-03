import { useMemo, useState } from 'react'
import { useThreadStore } from '../../stores/thread-store'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { ThreadItem } from './ThreadItem'
import type { Thread } from '../../types'

interface GroupedThreads {
  projectId: string | null
  projectName: string
  threads: Thread[]
}

interface ThreadListProps {
  onThreadClick?: () => void
}

export function ThreadList({ onThreadClick }: ThreadListProps) {
  const threads = useThreadStore((s) => s.threads)
  const activeThreadId = useThreadStore((s) => s.activeThreadId)
  const setActiveThread = useThreadStore((s) => s.setActiveThread)

  // Track which project sections are collapsed
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())

  // Group threads by project, sorted by lastMessageAt within each group
  const groupedThreads = useMemo(() => {
    const activeThreads = Array.from(threads.values()).filter((t) => t.status !== 'archived')

    // Group by projectId
    const groups = new Map<string | null, Thread[]>()

    activeThreads.forEach((thread) => {
      const key = thread.projectId || null
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key)!.push(thread)
    })

    // Sort threads within each group by lastMessageAt descending
    groups.forEach((threadList) => {
      threadList.sort((a, b) => b.lastMessageAt - a.lastMessageAt)
    })

    // Convert to array and create project names
    const result: GroupedThreads[] = []

    // Add all projects with threads
    groups.forEach((threadList, projectId) => {
      result.push({
        projectId,
        projectName: projectId || 'Unsorted',
        threads: threadList
      })
    })

    // Sort groups: projects with threads first (sorted alphabetically), then Unsorted
    result.sort((a, b) => {
      if (a.projectId === null) return 1
      if (b.projectId === null) return -1
      return a.projectName.localeCompare(b.projectName)
    })

    return result
  }, [threads])

  const toggleProject = (projectId: string | null) => {
    const key = projectId || 'unsorted'
    setCollapsedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const isProjectCollapsed = (projectId: string | null) => {
    const key = projectId || 'unsorted'
    return collapsedProjects.has(key)
  }

  if (groupedThreads.length === 0) {
    return (
      <div className="px-4 pb-4 text-sm text-muted-foreground">No active threads</div>
    )
  }

  return (
    <div className="space-y-1">
      {groupedThreads.map((group) => {
        const collapsed = isProjectCollapsed(group.projectId)
        const projectKey = group.projectId || 'unsorted'

        return (
          <div key={projectKey}>
            {/* Project header */}
            <button
              onClick={() => toggleProject(group.projectId)}
              className="w-full px-3 py-2 flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4 shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0" />
              )}
              <span className="truncate">{group.projectName}</span>
              <span className="ml-auto text-xs">{group.threads.length}</span>
            </button>

            {/* Thread list (collapsed if needed) */}
            {!collapsed && (
              <div className="space-y-1">
                {group.threads.map((thread) => (
                  <ThreadItem
                    key={thread.id}
                    thread={thread}
                    isActive={thread.id === activeThreadId}
                    onClick={() => {
                      setActiveThread(thread.id)
                      onThreadClick?.()
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
