/**
 * Panel Drag-and-Drop Protocol
 *
 * Defines types, utilities, and drop zone resolution for the panel system.
 * Uses @dnd-kit for the underlying DnD implementation.
 */

// Drag data types
export type DragItemType = "pane" | "thread" | "tab";

export interface PaneDragData {
  type: "pane";
  panelId: string;
  workspaceId: string;
}

export interface ThreadDragData {
  type: "thread";
  chatId: string;
  title: string;
}

export interface TabDragData {
  type: "tab";
  panelId: string;
  tabId: string;
  contentId?: string;
  workspaceId: string;
}

export type DragData = PaneDragData | ThreadDragData | TabDragData;

// Drop zones - where in a panel the drop can occur
export type DropZone = "left" | "right" | "top" | "bottom" | "center" | null;

// Result of a drop operation
export interface DropResult {
  zone: DropZone;
  targetPanelId: string;
  action: DropAction;
}

export type DropAction =
  | { type: "split"; direction: "horizontal" | "vertical"; position: "before" | "after" }
  | { type: "swap" }
  | { type: "replace" };

// Edge threshold for drop zones (25% from edges)
const EDGE_THRESHOLD = 0.25;

// Hysteresis constants for zone stability
const ZONE_CHANGE_DELAY_MS = 50;
const ZONE_EXIT_BUFFER = 0.08; // 8% extra to exit zone

// State tracking for hysteresis
export interface ZoneState {
  currentZone: DropZone;
  lastChangeTime: number;
}

/**
 * Resolve which drop zone is active based on cursor position within a panel.
 *
 * Layout of drop zones:
 * ┌──────────────────────────────────┐
 * │            TOP (25%)             │  → Vertical split, insert above
 * ├────────┬──────────────┬──────────┤
 * │        │              │          │
 * │ LEFT   │   CENTER     │  RIGHT   │  → Left/Right: Horizontal split
 * │ (25%)  │   (50%)      │  (25%)   │  → Center: Replace/swap content
 * │        │              │          │
 * ├────────┴──────────────┴──────────┤
 * │           BOTTOM (25%)           │  → Vertical split, insert below
 * └──────────────────────────────────┘
 */
export function resolveDropZone(rect: DOMRect, clientX: number, clientY: number): DropZone {
  // Calculate relative position, clamped to [0, 1] to handle cursor outside rect
  const rawRelativeX = (clientX - rect.left) / rect.width;
  const rawRelativeY = (clientY - rect.top) / rect.height;
  const relativeX = Math.max(0, Math.min(1, rawRelativeX));
  const relativeY = Math.max(0, Math.min(1, rawRelativeY));

  // Check vertical edges first (top/bottom take priority at corners)
  if (relativeY < EDGE_THRESHOLD) {
    return "top";
  }
  if (relativeY > 1 - EDGE_THRESHOLD) {
    return "bottom";
  }

  // Check horizontal edges
  if (relativeX < EDGE_THRESHOLD) {
    return "left";
  }
  if (relativeX > 1 - EDGE_THRESHOLD) {
    return "right";
  }

  // Center zone
  return "center";
}

/**
 * Resolve drop zone with hysteresis to prevent flickering at boundaries.
 * Uses time delay and exit buffer to stabilize zone transitions.
 */
export function resolveDropZoneWithHysteresis(
  rect: DOMRect,
  clientX: number,
  clientY: number,
  previousState: ZoneState | null,
): { zone: DropZone; state: ZoneState } {
  const rawZone = resolveDropZone(rect, clientX, clientY);
  const now = Date.now();

  // No previous state - return raw zone
  if (!previousState) {
    return {
      zone: rawZone,
      state: { currentZone: rawZone, lastChangeTime: now },
    };
  }

  // Same zone - keep it
  if (rawZone === previousState.currentZone) {
    return {
      zone: previousState.currentZone,
      state: previousState,
    };
  }

  // Check time delay
  const timeSinceChange = now - previousState.lastChangeTime;
  if (timeSinceChange < ZONE_CHANGE_DELAY_MS) {
    return {
      zone: previousState.currentZone,
      state: previousState,
    };
  }

  // Check exit buffer - cursor must be further into new zone to switch
  // Clamp relative position to handle cursor at/beyond edges
  const rawRelativeX = (clientX - rect.left) / rect.width;
  const rawRelativeY = (clientY - rect.top) / rect.height;
  const relativeX = Math.max(0, Math.min(1, rawRelativeX));
  const relativeY = Math.max(0, Math.min(1, rawRelativeY));
  const bufferedThreshold = EDGE_THRESHOLD + ZONE_EXIT_BUFFER;

  // If we're leaving an edge zone, require cursor to be well past the threshold
  if (previousState.currentZone === "left" && relativeX < bufferedThreshold) {
    return { zone: "left", state: previousState };
  }
  if (previousState.currentZone === "right" && relativeX > 1 - bufferedThreshold) {
    return { zone: "right", state: previousState };
  }
  if (previousState.currentZone === "top" && relativeY < bufferedThreshold) {
    return { zone: "top", state: previousState };
  }
  if (previousState.currentZone === "bottom" && relativeY > 1 - bufferedThreshold) {
    return { zone: "bottom", state: previousState };
  }

  // Transition to new zone
  return {
    zone: rawZone,
    state: { currentZone: rawZone, lastChangeTime: now },
  };
}

/**
 * Convert drop zone to a drop action
 */
export function zoneToAction(zone: DropZone, dragType: DragItemType): DropAction | null {
  if (!zone) return null;

  switch (zone) {
    case "left":
      return { type: "split", direction: "horizontal", position: "before" };
    case "right":
      return { type: "split", direction: "horizontal", position: "after" };
    case "top":
      return { type: "split", direction: "vertical", position: "before" };
    case "bottom":
      return { type: "split", direction: "vertical", position: "after" };
    case "center":
      // Pane drag to center = swap contents, Thread/tab drag = replace
      return dragType === "pane" ? { type: "swap" } : { type: "replace" };
  }
}

/**
 * Check if a drop is valid (can't drop a pane on itself)
 */
export function isValidDrop(dragData: DragData, targetPanelId: string, zone: DropZone): boolean {
  if (!zone) return false;

  // Can't drop pane on itself (for any zone)
  if (dragData.type === "pane" && dragData.panelId === targetPanelId) {
    return false;
  }

  // Tab dropped on its own panel is always a no-op (any zone)
  if (dragData.type === "tab" && dragData.panelId === targetPanelId) {
    return false;
  }

  return true;
}

// Custom drag item ID format for @dnd-kit
export function createDragId(data: DragData): string {
  if (data.type === "pane") {
    return `pane:${data.panelId}`;
  }
  if (data.type === "tab") {
    return `tab:${data.panelId}:${data.tabId}`;
  }
  return `thread:${data.chatId}`;
}

export function parseDragId(id: string): { type: DragItemType; id: string } | null {
  const parts = id.split(":");
  if (parts[0] === "pane" || parts[0] === "thread") {
    return { type: parts[0], id: parts[1] };
  }
  if (parts[0] === "tab") {
    return { type: "tab", id: parts[2] }; // tab:panelId:tabId
  }
  return null;
}
