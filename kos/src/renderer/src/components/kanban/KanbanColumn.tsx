import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { memo, useMemo } from "react";
import type { LinearIssue, LinearState } from "../../types/linear";
import { cn } from "../../lib/utils";
import { useKanbanDnd } from "./hooks/use-kanban-dnd";
import { KanbanCard } from "./KanbanCard";

interface KanbanColumnProps {
  state: LinearState;
  issues: LinearIssue[];
}

// Priority weight: lower number = higher priority (1=urgent is highest)
// 0 (no priority) treated as lowest
function getPriorityWeight(priority: number): number {
  if (priority === 0) return 100; // No priority = lowest
  return priority; // 1=urgent (highest), 4=low (lowest among set priorities)
}

// Sort issues: unblocked first, then by priority, then by downstream count
function sortIssues(issues: LinearIssue[]): LinearIssue[] {
  return [...issues].sort((a, b) => {
    // 1. Unblocked issues first
    if (a.isBlocked !== b.isBlocked) {
      return a.isBlocked ? 1 : -1;
    }

    // 2. Higher priority first (lower priority number = higher priority)
    const priorityDiff = getPriorityWeight(a.priority) - getPriorityWeight(b.priority);
    if (priorityDiff !== 0) return priorityDiff;

    // 3. More downstream (blocking others) first
    const downstreamA = a.downstreamCount || 0;
    const downstreamB = b.downstreamCount || 0;
    return downstreamB - downstreamA;
  });
}

export const KanbanColumn = memo(function KanbanColumn({ state, issues }: KanbanColumnProps) {
  const { isDragging } = useKanbanDnd();

  const { setNodeRef, isOver } = useDroppable({
    id: state.id,
    data: {
      type: "kanban-column",
      stateId: state.id,
    },
  });

  const sortedIssues = useMemo(() => sortIssues(issues), [issues]);
  const issueIds = useMemo(() => sortedIssues.map((i) => i.id), [sortedIssues]);

  return (
    <div className="flex flex-col min-w-[280px] max-w-[320px] h-full">
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <div
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: state.color }}
        />
        <h3 className="text-sm font-medium truncate">{state.name}</h3>
        <span className="text-xs text-muted-foreground ml-auto">{issues.length}</span>
      </div>

      {/* Column content */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 overflow-y-auto p-2 space-y-2",
          "transition-colors duration-150",
          isOver && isDragging && "bg-primary/5",
        )}
      >
        <SortableContext items={issueIds} strategy={verticalListSortingStrategy}>
          {sortedIssues.map((issue) => (
            <KanbanCard key={issue.id} issue={issue} />
          ))}
        </SortableContext>

        {issues.length === 0 && (
          <div className="flex items-center justify-center h-20 text-xs text-muted-foreground/60 border border-dashed border-muted rounded-lg">
            No issues
          </div>
        )}
      </div>
    </div>
  );
});
