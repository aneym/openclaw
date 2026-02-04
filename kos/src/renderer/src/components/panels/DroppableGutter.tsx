/**
 * DroppableGutter
 *
 * Resize handle that doubles as a drop zone for inserting panels between existing ones.
 * Shows an animated preview line when hovering during drag operations.
 */

import { useDroppable } from "@dnd-kit/core";
import { PanelResizeHandle } from "react-resizable-panels";
import { motion, AnimatePresence } from "../../lib/motion";
import { cn } from "../../lib/utils";
import { usePanelDnd } from "./PanelDndProvider";

interface DroppableGutterProps {
  gutterId: string;
  direction: "horizontal" | "vertical";
  /** ID of the panel BEFORE this gutter (left/top) */
  beforePanelId: string;
  /** ID of the panel AFTER this gutter (right/bottom) */
  afterPanelId: string;
}

export function DroppableGutter({
  gutterId,
  direction,
  beforePanelId,
  afterPanelId,
}: DroppableGutterProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `gutter-${gutterId}`,
    data: {
      type: "gutter",
      gutterId,
      direction,
      beforePanelId,
      afterPanelId,
    },
  });

  const { activeDragData } = usePanelDnd();
  const isDragging = activeDragData !== null;

  // Expand the gutter hit area during drag
  const isHorizontal = direction === "horizontal";

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative group",
        // Expand hit area during drag
        isDragging && (isHorizontal ? "mx-[-8px] px-[8px]" : "my-[-8px] py-[8px]"),
      )}
    >
      <PanelResizeHandle
        className={cn(
          "transition-all duration-150",
          isHorizontal ? "w-1" : "h-1",
          "bg-border hover:bg-primary/50",
          "data-[resize-handle-state=drag]:bg-primary",
          // Highlight when dragging over
          isOver && "bg-primary",
        )}
      />

      {/* Animated drop indicator */}
      <AnimatePresence>
        {isOver && isDragging && <GutterDropIndicator direction={direction} />}
      </AnimatePresence>
    </div>
  );
}

// Animated indicator showing where panel will be inserted
function GutterDropIndicator({ direction }: { direction: "horizontal" | "vertical" }) {
  const isHorizontal = direction === "horizontal";

  return (
    <motion.div
      initial={{ opacity: 0, scale: isHorizontal ? 1 : 0.8, scaleY: isHorizontal ? 0.8 : 1 }}
      animate={{ opacity: 1, scale: 1, scaleY: 1 }}
      exit={{ opacity: 0, scale: isHorizontal ? 1 : 0.8, scaleY: isHorizontal ? 0.8 : 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={cn(
        "absolute z-50 pointer-events-none",
        isHorizontal
          ? "left-1/2 -translate-x-1/2 top-0 bottom-0 w-1"
          : "top-1/2 -translate-y-1/2 left-0 right-0 h-1",
      )}
    >
      {/* Static glowing line (no infinite animation) */}
      <div
        className={cn(
          "absolute bg-primary rounded-full",
          isHorizontal ? "inset-y-2 left-0 right-0" : "inset-x-2 top-0 bottom-0",
        )}
        style={{
          boxShadow: "0 0 8px 2px hsl(var(--primary) / 0.5)",
        }}
      />

      {/* Insert label */}
      <motion.div
        initial={{ opacity: 0, y: isHorizontal ? -10 : 0, x: isHorizontal ? 0 : -10 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        className={cn(
          "absolute text-xs font-medium text-primary-foreground bg-primary px-2 py-1 rounded shadow-lg whitespace-nowrap",
          isHorizontal
            ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            : "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
        )}
      >
        Insert
      </motion.div>
    </motion.div>
  );
}
