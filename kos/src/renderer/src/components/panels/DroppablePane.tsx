/**
 * DroppablePane
 *
 * Wrapper component that makes a panel droppable for DnD operations.
 * Shows VS Code-style insertion lines and split previews during drag operations.
 */

import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import type { DropZone } from "../../lib/panel-dnd";
import type { PanelType } from "../../types";
import { motion, AnimatePresence } from "../../lib/motion";
import { cn } from "../../lib/utils";
import { TABBED_PANEL_TYPES } from "../../types";
import { usePanelDnd } from "./PanelDndProvider";

interface DroppablePaneProps {
  panelId: string;
  panelType?: PanelType;
  children: ReactNode;
  className?: string;
}

export function DroppablePane({ panelId, panelType, children, className }: DroppablePaneProps) {
  const { setNodeRef } = useDroppable({
    id: `droppable-${panelId}`,
    data: { panelId },
  });

  const { overPanelId, dropZone, activeDragData, sourcePanelId, sourcePanelType } = usePanelDnd();

  // Check if this pane is the source being dragged (for fade effect)
  const isSource = activeDragData?.type === "pane" && sourcePanelId === panelId;

  // Determine if this pane is the active drop target
  const isActiveTarget = overPanelId === panelId && dropZone !== null;

  // Don't show drop zone if dragging this same pane
  const showDropZone =
    isActiveTarget && !(activeDragData?.type === "pane" && activeDragData.panelId === panelId);

  return (
    <div ref={setNodeRef} className={cn("relative h-full w-full", className)}>
      {/* Content with fade when being dragged */}
      <div
        className={cn("h-full w-full transition-opacity duration-150", isSource && "opacity-40")}
      >
        {children}
      </div>

      {/* Animated drop zone overlays */}
      <AnimatePresence>
        {showDropZone && (
          <DropZoneOverlay
            zone={dropZone}
            dragType={activeDragData?.type}
            isMergeTarget={
              activeDragData?.type === "tab" &&
              !!panelType &&
              TABBED_PANEL_TYPES.includes(panelType) &&
              panelType === sourcePanelType
            }
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Spring config for snappy animations
const springConfig = { type: "spring", stiffness: 400, damping: 25 } as const;

/**
 * VS Code-style drop zone overlay
 *
 * For edge zones: thin 2px insertion line at the actual insertion edge + 50% split preview
 * For center zone: dashed border with "Swap" (pane) or "Replace" (thread) label
 */
function DropZoneOverlay({
  zone,
  dragType,
  isMergeTarget,
}: {
  zone: DropZone;
  dragType?: "pane" | "thread" | "tab";
  isMergeTarget?: boolean;
}) {
  if (!zone) return null;

  // When merging tabs, show "Add Tab" overlay on any zone (edges don't split)
  if (isMergeTarget) {
    return (
      <motion.div
        key="merge"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={springConfig}
        className="absolute inset-2 pointer-events-none border-2 border-dashed border-primary rounded-md bg-primary/10"
      >
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-medium text-primary-foreground bg-primary px-2.5 py-1 rounded shadow-md">
          Add Tab
        </span>
      </motion.div>
    );
  }

  // Center zone has different treatment - more visible for replace/swap action
  if (zone === "center") {
    const centerLabel = isMergeTarget
      ? "Add Tab"
      : dragType === "pane"
        ? "Swap"
        : dragType === "tab"
          ? "Move Here"
          : "Replace";
    return (
      <motion.div
        key="center"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={springConfig}
        className="absolute inset-2 pointer-events-none border-2 border-dashed border-primary rounded-md bg-primary/10"
      >
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-medium text-primary-foreground bg-primary px-2.5 py-1 rounded shadow-md">
          {centerLabel}
        </span>
      </motion.div>
    );
  }

  // Edge zones: split preview + insertion line
  // Use a wrapper div with key for AnimatePresence to work properly
  return (
    <motion.div
      key={`edge-${zone}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.1 }}
      className="absolute inset-0 pointer-events-none"
    >
      {/* 50% split preview */}
      <div className="absolute bg-primary/10" style={getSplitPreviewStyle(zone)} />

      {/* 2px insertion line at actual edge */}
      <motion.div
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        transition={springConfig}
        className="absolute bg-primary"
        style={{
          ...getInsertionLineStyle(zone),
          boxShadow: "0 0 8px 2px hsl(var(--primary) / 0.5)",
        }}
      />
    </motion.div>
  );
}

// Get the 50% split preview style based on zone
function getSplitPreviewStyle(zone: DropZone): React.CSSProperties {
  switch (zone) {
    case "left":
      return { left: 0, top: 0, bottom: 0, width: "50%" };
    case "right":
      return { right: 0, top: 0, bottom: 0, width: "50%" };
    case "top":
      return { left: 0, right: 0, top: 0, height: "50%" };
    case "bottom":
      return { left: 0, right: 0, bottom: 0, height: "50%" };
    default:
      return {};
  }
}

// Get the 2px insertion line style at the ACTUAL insertion edge
function getInsertionLineStyle(zone: DropZone): React.CSSProperties {
  switch (zone) {
    case "left":
      // Line at LEFT edge (where panel will be inserted)
      return { left: 0, top: 8, bottom: 8, width: 2, borderRadius: 1 };
    case "right":
      // Line at RIGHT edge
      return { right: 0, top: 8, bottom: 8, width: 2, borderRadius: 1 };
    case "top":
      // Line at TOP edge
      return { left: 8, right: 8, top: 0, height: 2, borderRadius: 1 };
    case "bottom":
      // Line at BOTTOM edge
      return { left: 8, right: 8, bottom: 0, height: 2, borderRadius: 1 };
    default:
      return {};
  }
}
