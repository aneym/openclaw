import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { memo } from "react";
import type { LinearIssue } from "../../types/linear";
import { cn } from "../../lib/utils";
import { KanbanCardBadges } from "./KanbanCardBadges";

interface KanbanCardProps {
  issue: LinearIssue;
  isDragOverlay?: boolean;
}

// Priority icons: 0=none, 1=urgent, 2=high, 3=medium, 4=low
const priorityConfig: Record<number, { icon: string; color: string; label: string }> = {
  0: { icon: "⚪", color: "text-muted-foreground", label: "No priority" },
  1: { icon: "🔴", color: "text-red-500", label: "Urgent" },
  2: { icon: "🟠", color: "text-orange-500", label: "High" },
  3: { icon: "🟡", color: "text-yellow-500", label: "Medium" },
  4: { icon: "🔵", color: "text-blue-500", label: "Low" },
};

export const KanbanCard = memo(function KanbanCard({ issue, isDragOverlay }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: issue.id,
    data: {
      type: "kanban-card",
      issueId: issue.id,
      currentStateId: issue.state.id,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const priority = priorityConfig[issue.priority] || priorityConfig[0];

  return (
    <div
      ref={setNodeRef}
      style={isDragOverlay ? undefined : style}
      {...attributes}
      {...listeners}
      className={cn(
        "p-3 bg-card border border-border rounded-lg cursor-grab active:cursor-grabbing",
        "hover:border-primary/50 transition-colors",
        isDragging && "opacity-50",
        isDragOverlay && "shadow-xl rotate-2",
        issue.isBlocked && "opacity-60",
      )}
    >
      {/* Header: Priority + Identifier */}
      <div className="flex items-center gap-2 text-xs">
        <span title={priority.label}>{priority.icon}</span>
        <span className="font-mono text-muted-foreground">{issue.identifier}</span>
      </div>

      {/* Title */}
      <h4 className="text-sm font-medium mt-1.5 line-clamp-2">{issue.title}</h4>

      {/* Labels */}
      {issue.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {issue.labels.slice(0, 3).map((label) => (
            <span
              key={label.id}
              className="px-1.5 py-0.5 text-[10px] rounded-full"
              style={{
                backgroundColor: `${label.color}20`,
                color: label.color,
              }}
            >
              {label.name}
            </span>
          ))}
          {issue.labels.length > 3 && (
            <span className="px-1.5 py-0.5 text-[10px] text-muted-foreground">
              +{issue.labels.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Assignee */}
      {issue.assignee && (
        <div className="flex items-center gap-1.5 mt-2">
          {issue.assignee.avatarUrl ? (
            <img
              src={issue.assignee.avatarUrl}
              alt={issue.assignee.displayName}
              className="h-5 w-5 rounded-full"
            />
          ) : (
            <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-medium">
              {issue.assignee.displayName.charAt(0)}
            </div>
          )}
          <span className="text-xs text-muted-foreground truncate">
            {issue.assignee.displayName}
          </span>
        </div>
      )}

      {/* Dependency badges */}
      <KanbanCardBadges relations={issue.relations} downstreamCount={issue.downstreamCount} />
    </div>
  );
});
