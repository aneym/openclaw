import { useDroppable } from '@dnd-kit/core'
import type { LinearIssue, LinearState } from '@/linear/types'
import type { DependencyGraph } from '@/linear/hooks/useDependencyGraph'
import { LinearCard } from './LinearCard'

interface LinearColumnProps {
  state: LinearState
  issues: LinearIssue[]
  graph: DependencyGraph
  projectId?: string
}

export function LinearColumn({ state, issues, graph, projectId }: LinearColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: state.id
  })

  return (
    <div className="flex w-80 shrink-0 flex-col rounded-lg border bg-card">
      {/* Column header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <div
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: state.color }}
          />
          <h3 className="font-medium">{state.name}</h3>
        </div>
        <div className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {issues.length}
        </div>
      </div>

      {/* Column content - droppable area */}
      <div
        ref={setNodeRef}
        className={`flex flex-1 flex-col gap-2 overflow-y-auto p-3 transition-colors ${
          isOver ? 'bg-accent/50' : ''
        }`}
      >
        {issues.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            {isOver ? 'Drop here' : 'No issues'}
          </div>
        ) : (
          issues.map((issue) => <LinearCard key={issue.id} issue={issue} graph={graph} projectId={projectId} />)
        )}
      </div>
    </div>
  )
}
