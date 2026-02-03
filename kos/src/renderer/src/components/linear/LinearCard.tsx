import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { LinearIssue } from '@/linear/types'
import type { DependencyGraph } from '@/linear/hooks/useDependencyGraph'
import { AlertCircle, ArrowDown, ArrowUp, Signal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLinearCardClick } from './useLinearCardClick'
import { useState, useRef } from 'react'

interface LinearCardProps {
  issue: LinearIssue
  graph: DependencyGraph
  projectId?: string
}

// Priority icon mapping
const getPriorityIcon = (priority: number) => {
  switch (priority) {
    case 1: // Urgent
      return <AlertCircle className="h-3.5 w-3.5 text-red-500" />
    case 2: // High
      return <ArrowUp className="h-3.5 w-3.5 text-orange-500" />
    case 3: // Medium
      return <Signal className="h-3.5 w-3.5 text-yellow-500" />
    case 4: // Low
      return <ArrowDown className="h-3.5 w-3.5 text-blue-500" />
    default: // None
      return null
  }
}

export function LinearCard({ issue, graph, projectId }: LinearCardProps) {
  const isBlocked = graph.isBlocked(issue.id)
  const downstreamCount = graph.getDownstreamCount(issue.id)
  const priorityIcon = getPriorityIcon(issue.priority)
  const handleCardClick = useLinearCardClick()

  const [isDragStarted, setIsDragStarted] = useState(false)
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null)

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: issue.id
  })

  const style = {
    transform: CSS.Translate.toString(transform)
  }

  // Detect click vs drag
  const handleMouseDown = (e: React.MouseEvent) => {
    mouseDownPos.current = { x: e.clientX, y: e.clientY }
    setIsDragStarted(false)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (mouseDownPos.current) {
      const dx = Math.abs(e.clientX - mouseDownPos.current.x)
      const dy = Math.abs(e.clientY - mouseDownPos.current.y)
      // Consider it a drag if moved more than 5px
      if (dx > 5 || dy > 5) {
        setIsDragStarted(true)
      }
    }
  }

  const handleClick = () => {
    // Only open thread if it wasn't a drag
    if (!isDragStarted) {
      handleCardClick(issue, projectId)
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onClick={handleClick}
      className={cn(
        'rounded-md border bg-background p-3 transition-all hover:border-primary hover:shadow-sm',
        isBlocked && 'opacity-60',
        isDragging && 'opacity-50',
        'cursor-grab active:cursor-grabbing'
      )}
    >
      {/* Header: identifier + priority + downstream count */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <div className="text-xs font-medium text-muted-foreground">{issue.identifier}</div>
          {priorityIcon}
        </div>

        {downstreamCount > 0 && (
          <div className="flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
            ↓{downstreamCount}
          </div>
        )}
      </div>

      {/* Title */}
      <div className="mt-1.5 text-sm font-medium leading-tight">{issue.title}</div>

      {/* Blocked badge */}
      {isBlocked && (
        <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <span>⛔</span>
          <span>Blocked</span>
        </div>
      )}

      {/* Assignee */}
      {issue.assignee && (
        <div className="mt-2 flex items-center gap-1.5">
          {issue.assignee.avatarUrl ? (
            <img
              src={issue.assignee.avatarUrl}
              alt={issue.assignee.displayName}
              className="h-4 w-4 rounded-full"
            />
          ) : (
            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
              {issue.assignee.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="text-xs text-muted-foreground">{issue.assignee.displayName}</span>
        </div>
      )}

      {/* Labels */}
      {issue.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {issue.labels.map((label) => (
            <div
              key={label.id}
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: `${label.color}20`,
                color: label.color
              }}
            >
              {label.name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
