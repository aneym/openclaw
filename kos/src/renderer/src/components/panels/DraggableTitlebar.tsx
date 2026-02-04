/**
 * DraggableTitlebar
 *
 * Wrapper that makes a panel's titlebar draggable for pane rearrangement.
 * DragOverlay handles the visual drag preview, so we don't apply transforms here.
 */

import type { ReactNode } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { PaneDragData } from "../../lib/panel-dnd";
import { cn } from "../../lib/utils";

interface DraggableTitlebarProps {
  panelId: string;
  workspaceId: string;
  children: ReactNode;
  className?: string;
}

export function DraggableTitlebar({
  panelId,
  workspaceId,
  children,
  className,
}: DraggableTitlebarProps) {
  const dragData: PaneDragData = {
    type: "pane",
    panelId,
    workspaceId,
  };

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pane-${panelId}`,
    data: dragData,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-dragging={isDragging || undefined}
      className={cn(
        "flex items-center cursor-grab overflow-hidden min-w-0",
        className,
        isDragging && "cursor-grabbing",
      )}
      title="Drag to rearrange"
    >
      {children}
    </div>
  );
}
