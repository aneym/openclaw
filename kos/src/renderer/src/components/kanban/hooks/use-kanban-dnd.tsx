/**
 * Kanban DnD Context
 *
 * Provides drag-and-drop functionality for the kanban board using @dnd-kit.
 * Handles card dragging between columns with optimistic state updates.
 */

import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useState, useCallback, createContext, useContext, type ReactNode } from "react";
import { toast } from "sonner";
import type { LinearIssue } from "../../../types/linear";
import { useLinearStore } from "../../../stores/linear-store";

// Priority icons: 0=none, 1=urgent, 2=high, 3=medium, 4=low
const priorityConfig: Record<number, { icon: string; label: string }> = {
  0: { icon: "⚪", label: "No priority" },
  1: { icon: "🔴", label: "Urgent" },
  2: { icon: "🟠", label: "High" },
  3: { icon: "🟡", label: "Medium" },
  4: { icon: "🔵", label: "Low" },
};

// Inline overlay component to avoid circular imports with KanbanCard
function DragOverlayCard({ issue }: { issue: LinearIssue }) {
  const priority = priorityConfig[issue.priority] || priorityConfig[0];
  return (
    <div className="p-3 bg-card border border-border rounded-lg shadow-xl rotate-2 w-[280px]">
      <div className="flex items-center gap-2 text-xs">
        <span title={priority.label}>{priority.icon}</span>
        <span className="font-mono text-muted-foreground">{issue.identifier}</span>
      </div>
      <h4 className="text-sm font-medium mt-1.5 line-clamp-2">{issue.title}</h4>
    </div>
  );
}

interface KanbanDndContextValue {
  activeIssue: LinearIssue | null;
  isDragging: boolean;
}

const KanbanDndContext = createContext<KanbanDndContextValue>({
  activeIssue: null,
  isDragging: false,
});

export function useKanbanDnd() {
  return useContext(KanbanDndContext);
}

interface KanbanDndProviderProps {
  children: ReactNode;
  teamId: string;
}

export function KanbanDndProvider({ children, teamId }: KanbanDndProviderProps) {
  const [activeIssue, setActiveIssue] = useState<LinearIssue | null>(null);
  const updateIssueState = useLinearStore((s) => s.updateIssueState);
  const issuesByTeam = useLinearStore((s) => s.issuesByTeam);

  // Configure pointer sensor with activation constraint
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px drag before activating
      },
    }),
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const issueId = event.active.id as string;
      const issues = issuesByTeam.get(teamId) || [];
      const issue = issues.find((i) => i.id === issueId);
      if (issue) {
        setActiveIssue(issue);
      }
    },
    [issuesByTeam, teamId],
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveIssue(null);

      if (!over) return;

      const issueId = active.id as string;

      // Check if dropped on a column (state)
      const overData = over.data.current as { type?: string; stateId?: string } | undefined;
      if (overData?.type !== "kanban-column") return;

      const targetStateId = overData.stateId;
      if (!targetStateId) return;

      // Get current issue state
      const issues = issuesByTeam.get(teamId) || [];
      const issue = issues.find((i) => i.id === issueId);
      if (!issue) return;

      // Skip if same state
      if (issue.state.id === targetStateId) return;

      // Update state (optimistic update handled in store)
      try {
        await updateIssueState(issueId, targetStateId);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update issue";
        toast.error("Failed to move issue", {
          description: message,
        });
      }
    },
    [issuesByTeam, teamId, updateIssueState],
  );

  const handleDragCancel = useCallback(() => {
    setActiveIssue(null);
  }, []);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <KanbanDndContext.Provider value={{ activeIssue, isDragging: !!activeIssue }}>
        {children}
      </KanbanDndContext.Provider>

      <DragOverlay dropAnimation={null}>
        {activeIssue && <DragOverlayCard issue={activeIssue} />}
      </DragOverlay>
    </DndContext>
  );
}
