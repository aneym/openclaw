import { useState, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent
} from '@dnd-kit/core'
import { useLinearTeam } from '@/linear/hooks/useLinearTeam'
import { useDependencyGraph } from '@/linear/hooks/useDependencyGraph'
import type { LinearIssue } from '@/linear/types'
import { LinearClient } from '@/linear/client'
import { LinearColumn } from './LinearColumn'
import { LinearCard } from './LinearCard'

interface LinearBoardProps {
  teamId: string
  apiKey: string
  projectId?: string
}

export function LinearBoard({ teamId, apiKey, projectId }: LinearBoardProps) {
  const { issues, states, isLoading, isError, error, refetch } = useLinearTeam({
    teamId,
    apiKey,
    refetchInterval: 60000
  })

  const graph = useDependencyGraph(issues)
  const [activeIssue, setActiveIssue] = useState<LinearIssue | null>(null)
  const [optimisticUpdates, setOptimisticUpdates] = useState<Map<string, string>>(new Map())

  // Configure drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8 // Require 8px movement before drag starts
      }
    })
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event
    const issue = issues.find((i) => i.id === active.id)
    if (issue) {
      setActiveIssue(issue)
    }
  }, [issues])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveIssue(null)

    if (!over || active.id === over.id) {
      return
    }

    const issueId = active.id as string
    const newStateId = over.id as string

    // Find the issue
    const issue = issues.find((i) => i.id === issueId)
    if (!issue || issue.state.id === newStateId) {
      return
    }

    // Optimistic update: immediately update local state
    setOptimisticUpdates((prev) => new Map(prev).set(issueId, newStateId))

    try {
      // Mutate via Linear API
      const client = new LinearClient(apiKey)
      await client.updateIssueState(issueId, newStateId)

      // Success: refetch to get the latest data from server
      await refetch()
    } catch (error) {
      console.error('Failed to update issue state:', error)
      // TODO: Show error toast
    } finally {
      // Clear optimistic update
      setOptimisticUpdates((prev) => {
        const next = new Map(prev)
        next.delete(issueId)
        return next
      })
    }
  }, [issues, apiKey, refetch])

  // Apply optimistic updates to issues
  const issuesWithOptimisticUpdates = issues.map((issue) => {
    const optimisticStateId = optimisticUpdates.get(issue.id)
    if (optimisticStateId) {
      const newState = states.find((s) => s.id === optimisticStateId)
      if (newState) {
        return { ...issue, state: newState }
      }
    }
    return issue
  })

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading Linear board...</div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-destructive">
          Failed to load Linear board: {error?.message}
        </div>
      </div>
    )
  }

  if (states.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-muted-foreground">No states found for this team</div>
      </div>
    )
  }

  // Sort states by position
  const sortedStates = [...states].sort((a, b) => a.position - b.position)

  // Group issues by state (using optimistically updated issues)
  const issuesByState = new Map<string, LinearIssue[]>()
  for (const state of sortedStates) {
    issuesByState.set(state.id, [])
  }

  for (const issue of issuesWithOptimisticUpdates) {
    const stateIssues = issuesByState.get(issue.state.id)
    if (stateIssues) {
      stateIssues.push(issue)
    }
  }

  // Sort issues within each state:
  // 1. Priority (urgent=1 first, low=4 last)
  // 2. Dependency depth (issues that unblock the most come first)
  const sortIssues = (issues: LinearIssue[]): LinearIssue[] => {
    return [...issues].sort((a, b) => {
      // Priority: lower number = higher priority
      if (a.priority !== b.priority) {
        // Priority 0 (none) should go last
        if (a.priority === 0) return 1
        if (b.priority === 0) return -1
        return a.priority - b.priority
      }

      // Dependency depth: more downstream tasks = higher priority
      const aDownstream = graph.getDownstreamCount(a.id)
      const bDownstream = graph.getDownstreamCount(b.id)
      if (aDownstream !== bDownstream) {
        return bDownstream - aDownstream
      }

      // Fallback: alphabetical by identifier
      return a.identifier.localeCompare(b.identifier)
    })
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex h-full flex-col overflow-hidden">
        {/* Board header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-lg font-semibold">Linear Board</h2>
          <div className="text-sm text-muted-foreground">
            {issues.length} {issues.length === 1 ? 'issue' : 'issues'}
          </div>
        </div>

        {/* Board columns */}
        <div className="flex flex-1 gap-4 overflow-x-auto p-4">
          {sortedStates.map((state) => {
            const stateIssues = issuesByState.get(state.id) || []
            const sortedIssues = sortIssues(stateIssues)

            return (
              <LinearColumn
                key={state.id}
                state={state}
                issues={sortedIssues}
                graph={graph}
                projectId={projectId}
              />
            )
          })}
        </div>
      </div>

      {/* Drag overlay - shows the card being dragged */}
      <DragOverlay>
        {activeIssue ? (
          <div className="rotate-2 opacity-90">
            <LinearCard issue={activeIssue} graph={graph} projectId={projectId} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
