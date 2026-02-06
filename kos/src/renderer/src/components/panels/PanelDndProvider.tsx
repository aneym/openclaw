/**
 * Panel DnD Provider
 *
 * Wraps the panel system with @dnd-kit context for drag-and-drop functionality.
 * Handles pane rearrangement, thread drops, and gutter insertions.
 */

import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragMoveEvent,
  type CollisionDetection,
  type Modifier,
} from "@dnd-kit/core";
import { hasSortableData } from "@dnd-kit/sortable";
import {
  MessageSquare,
  Globe,
  Terminal,
  SquareCode,
  Kanban,
  Eye,
  Code,
  Square,
} from "lucide-react";
import {
  useState,
  useCallback,
  useEffect,
  useRef,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import type { DragData, DropZone, ZoneState } from "../../lib/panel-dnd";
import type { PanelType, Chat } from "../../types";
import { motion, AnimatePresence } from "../../lib/motion";
import { resolveDropZoneWithHysteresis, zoneToAction, isValidDrop } from "../../lib/panel-dnd";
import { useChatStore } from "../../stores/chat-store";
import { usePanelStore } from "../../stores/panel-store";
import { TABBED_PANEL_TYPES } from "../../types";

// Snap overlay center to cursor so the preview doesn't offset when grabbing wide drag handles
const snapCenterToCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  if (activatorEvent instanceof MouseEvent && draggingNodeRect) {
    const offsetX = activatorEvent.clientX - draggingNodeRect.left - draggingNodeRect.width / 2;
    const offsetY = activatorEvent.clientY - draggingNodeRect.top - draggingNodeRect.height / 2;
    return { ...transform, x: transform.x + offsetX, y: transform.y + offsetY };
  }
  return transform;
};

interface PanelDndProviderProps {
  workspaceId: string;
  children: ReactNode;
}

// Gutter drop data
interface GutterDropData {
  type: "gutter";
  gutterId: string;
  direction: "horizontal" | "vertical";
  beforePanelId: string;
  afterPanelId: string;
}

// Context for sharing DnD state with child components
export interface PanelDndState {
  activeId: string | null;
  activeDragData: DragData | null;
  overPanelId: string | null;
  dropZone: DropZone;
  overGutterId: string | null;
  sourcePanelId: string | null; // Panel being dragged (for fade effect)
  sourcePanelType: PanelType | null; // Type of panel being dragged
}

const PanelDndContext = createContext<PanelDndState>({
  activeId: null,
  activeDragData: null,
  overPanelId: null,
  dropZone: null,
  overGutterId: null,
  sourcePanelId: null,
  sourcePanelType: null,
});

export function usePanelDnd() {
  return useContext(PanelDndContext);
}

/**
 * Custom collision detection that separates sortable tab reorder from panel drops.
 *
 * Problem: SortableContext creates droppable targets for each tab. These compete
 * with DroppablePane in default collision detection, causing wrong rects and
 * flickering zones.
 *
 * Solution: Same-container sortable items get priority (via pointerWithin for
 * precision). Everything else (panels, gutters) uses rectIntersection. Cross-
 * container sortable items are excluded entirely.
 */
const panelCollisionDetection: CollisionDetection = (args) => {
  const { active, droppableContainers } = args;

  // Check if active item is sortable (tab drag from SortableContext)
  const activeSortableContainerId = active.data.current?.sortable?.containerId;

  // Same-container sortable items (for tab reorder)
  const sameContainerSortable = activeSortableContainerId
    ? droppableContainers.filter(
        (c) => c.data.current?.sortable?.containerId === activeSortableContainerId,
      )
    : [];

  // Non-sortable items (DroppablePanes, gutters)
  const nonSortable = droppableContainers.filter((c) => !c.data.current?.sortable);

  // Prefer same-container sortable when pointer is directly over a tab
  if (sameContainerSortable.length > 0) {
    const sortableCollisions = pointerWithin({
      ...args,
      droppableContainers: sameContainerSortable,
    });
    if (sortableCollisions.length > 0) {
      return sortableCollisions;
    }
  }

  // Fall back to panels and gutters
  return rectIntersection({
    ...args,
    droppableContainers: nonSortable,
  });
};

export function PanelDndProvider({ workspaceId, children }: PanelDndProviderProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeDragData, setActiveDragData] = useState<DragData | null>(null);
  const [overPanelId, setOverPanelId] = useState<string | null>(null);
  const [dropZone, setDropZone] = useState<DropZone>(null);
  const [overGutterId, setOverGutterId] = useState<string | null>(null);
  const [gutterDropData, setGutterDropData] = useState<GutterDropData | null>(null);
  const [sourcePanelId, setSourcePanelId] = useState<string | null>(null);
  const [sourcePanelType, setSourcePanelType] = useState<PanelType | null>(null);

  // Use refs for mouse position and zone state to avoid re-render loops
  // These are read in handleDragOver but don't need to trigger re-renders
  const mousePositionRef = useRef<{ x: number; y: number } | null>(null);
  const zoneStateRef = useRef<ZoneState | null>(null);

  // Panel store actions
  const splitPanel = usePanelStore((s) => s.splitPanel);
  const openThreadInPane = usePanelStore((s) => s.openThreadInPane);
  const movePanelBeside = usePanelStore((s) => s.movePanelBeside);
  const swapPanelContents = usePanelStore((s) => s.swapPanelContents);
  const detachTab = usePanelStore((s) => s.detachTab);
  const mergeTabIntoPanel = usePanelStore((s) => s.mergeTabIntoPanel);
  const moveTab = usePanelStore((s) => s.moveTab);

  // Chat store
  const chatsMap = useChatStore((s) => s.chats);

  // Panel store for getting panel types
  const getLayout = usePanelStore((s) => s.getLayout);

  // Track actual mouse position for accurate zone detection
  useEffect(() => {
    if (!activeId) {
      // Reset refs when drag ends
      mousePositionRef.current = null;
      zoneStateRef.current = null;
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      mousePositionRef.current = { x: e.clientX, y: e.clientY };
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [activeId]);

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
      const { active } = event;
      setActiveId(active.id as string);

      // Extract drag data from the draggable element
      const data = active.data.current as DragData | undefined;
      if (data) {
        setActiveDragData(data);

        // Track source panel type (needed for drop handler)
        if (data.type === "pane" || data.type === "tab") {
          const layout = getLayout(workspaceId);
          const panel = layout.panels.get(data.panelId);
          setSourcePanelType(panel?.type || null);
          // Only fade the panel when dragging the whole pane, not individual tabs
          if (data.type === "pane") {
            setSourcePanelId(data.panelId);
          }
        }
      }
    },
    [getLayout, workspaceId],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { over } = event;

      if (!over || !activeDragData) {
        setOverPanelId(null);
        setDropZone(null);
        setOverGutterId(null);
        setGutterDropData(null);
        return;
      }

      // Check if hovering over a gutter
      const gutterData = over.data.current as GutterDropData | undefined;
      if (gutterData?.type === "gutter") {
        // Can't drop a pane/tab into a gutter adjacent to its source panel
        const sourcePId =
          activeDragData.type === "pane" || activeDragData.type === "tab"
            ? activeDragData.panelId
            : null;
        if (
          sourcePId &&
          (sourcePId === gutterData.beforePanelId || sourcePId === gutterData.afterPanelId)
        ) {
          setOverGutterId(null);
          setGutterDropData(null);
          setOverPanelId(null);
          setDropZone(null);
          return;
        }

        setOverGutterId(gutterData.gutterId);
        setGutterDropData(gutterData);
        setOverPanelId(null);
        setDropZone(null);
        return;
      }

      // Clear gutter state when over a panel
      setOverGutterId(null);
      setGutterDropData(null);

      // If hovering over a sortable tab, clear panel drop zone (reorder handled in dragEnd).
      // Custom collision detection guarantees this is same-container only.
      if (over.data.current?.sortable) {
        setOverPanelId(null);
        setDropZone(null);
        return;
      }

      // Get the droppable panel ID
      const panelId = over.data.current?.panelId as string | undefined;
      if (!panelId) {
        setOverPanelId(null);
        setDropZone(null);
        return;
      }

      // Get the droppable element's rect
      const rect = over.rect;
      if (!rect) {
        setOverPanelId(null);
        setDropZone(null);
        return;
      }

      // Use actual mouse position for accurate zone detection (fallback to rect center)
      const mousePos = mousePositionRef.current;
      const cursorX = mousePos?.x ?? rect.left + rect.width / 2;
      const cursorY = mousePos?.y ?? rect.top + rect.height / 2;

      // Resolve drop zone with hysteresis
      const { zone, state: newZoneState } = resolveDropZoneWithHysteresis(
        new DOMRect(rect.left, rect.top, rect.width, rect.height),
        cursorX,
        cursorY,
        zoneStateRef.current,
      );
      zoneStateRef.current = newZoneState;

      // Check if valid drop
      if (isValidDrop(activeDragData, panelId, zone)) {
        setOverPanelId(panelId);
        setDropZone(zone);
      } else {
        setOverPanelId(null);
        setDropZone(null);
      }
    },
    [activeDragData],
  );

  // Continuous zone update — onDragOver only fires when `over` changes,
  // so we need onDragMove for zone updates as cursor moves within a panel.
  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      const { over } = event;
      if (!over || !activeDragData) return;

      // Only update zone for panel drops (gutters/sortable handled by onDragOver)
      if (over.data.current?.sortable || over.data.current?.type === "gutter") return;

      const panelId = over.data.current?.panelId as string | undefined;
      if (!panelId) return;

      const rect = over.rect;
      if (!rect) return;

      const mousePos = mousePositionRef.current;
      const cursorX = mousePos?.x ?? rect.left + rect.width / 2;
      const cursorY = mousePos?.y ?? rect.top + rect.height / 2;

      const { zone, state: newZoneState } = resolveDropZoneWithHysteresis(
        new DOMRect(rect.left, rect.top, rect.width, rect.height),
        cursorX,
        cursorY,
        zoneStateRef.current,
      );
      zoneStateRef.current = newZoneState;

      if (isValidDrop(activeDragData, panelId, zone)) {
        setOverPanelId(panelId);
        setDropZone(zone);
      } else {
        setOverPanelId(null);
        setDropZone(null);
      }
    },
    [activeDragData],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      // Handle sortable tab reorder within the same panel
      if (
        over &&
        activeDragData?.type === "tab" &&
        hasSortableData(active) &&
        hasSortableData(over)
      ) {
        const activeSort = active.data.current.sortable;
        const overSort = over.data.current.sortable;
        // Same container = same panel tab bar → reorder
        if (
          activeSort.containerId === overSort.containerId &&
          activeSort.index !== overSort.index
        ) {
          // Extract panelId from the drag data
          moveTab(workspaceId, activeDragData.panelId, activeSort.index, overSort.index);
          // Reset and return — don't fall through to split/swap logic
          setActiveId(null);
          setActiveDragData(null);
          setOverPanelId(null);
          setDropZone(null);
          setOverGutterId(null);
          setGutterDropData(null);
          setSourcePanelId(null);
          setSourcePanelType(null);
          zoneStateRef.current = null;
          return;
        }
      }

      // Handle gutter drops
      if (gutterDropData && activeDragData) {
        if (activeDragData.type === "thread") {
          splitPanel(workspaceId, gutterDropData.afterPanelId, gutterDropData.direction, "chat", {
            chatId: activeDragData.chatId,
          });
        } else if (activeDragData.type === "tab") {
          // Tab gutter drop: create new panel with tab content, detach from source
          const tabPanelType = sourcePanelType || "chat";
          const tabData: Record<string, unknown> = {};
          if (tabPanelType === "chat") {
            tabData.chatId = activeDragData.contentId;
          } else {
            tabData.contentId = activeDragData.contentId;
          }
          splitPanel(
            workspaceId,
            gutterDropData.afterPanelId,
            gutterDropData.direction,
            tabPanelType,
            tabData,
          );
          detachTab(workspaceId, activeDragData.panelId, activeDragData.tabId);
        } else if (activeDragData.type === "pane") {
          movePanelBeside(
            workspaceId,
            activeDragData.panelId,
            gutterDropData.afterPanelId,
            gutterDropData.direction,
            "before",
          );
        }
      } else if (over && activeDragData && overPanelId && dropZone) {
        const action = zoneToAction(dropZone, activeDragData.type);

        if (action) {
          // Tab drag onto a same-type tabbed panel → always merge (any zone)
          // Use pane drag (panel icon) for splitting instead
          if (activeDragData.type === "tab") {
            const targetPanel = getLayout(workspaceId).panels.get(overPanelId);
            const canMerge =
              targetPanel &&
              sourcePanelType === targetPanel.type &&
              TABBED_PANEL_TYPES.includes(targetPanel.type);

            if (canMerge) {
              mergeTabIntoPanel(
                workspaceId,
                activeDragData.panelId,
                activeDragData.tabId,
                overPanelId,
              );
            } else if (action.type === "split") {
              // Tab onto non-compatible panel edge: split into new panel
              const tabPanelType = sourcePanelType || "chat";
              const tabData: Record<string, unknown> = {};
              if (tabPanelType === "chat") {
                tabData.chatId = activeDragData.contentId;
              } else {
                tabData.contentId = activeDragData.contentId;
              }
              splitPanel(workspaceId, overPanelId, action.direction, tabPanelType, tabData);
              detachTab(workspaceId, activeDragData.panelId, activeDragData.tabId);
            } else if (
              action.type === "replace" &&
              activeDragData.contentId &&
              sourcePanelType === "chat"
            ) {
              openThreadInPane(workspaceId, overPanelId, activeDragData.contentId);
              detachTab(workspaceId, activeDragData.panelId, activeDragData.tabId);
            }
          } else if (action.type === "split") {
            if (activeDragData.type === "thread") {
              splitPanel(workspaceId, overPanelId, action.direction, "chat", {
                chatId: activeDragData.chatId,
              });
            } else {
              movePanelBeside(
                workspaceId,
                activeDragData.panelId,
                overPanelId,
                action.direction,
                action.position,
              );
            }
          } else if (action.type === "replace") {
            if (activeDragData.type === "thread") {
              openThreadInPane(workspaceId, overPanelId, activeDragData.chatId);
            }
          } else if (action.type === "swap") {
            if (activeDragData.type === "pane") {
              swapPanelContents(workspaceId, activeDragData.panelId, overPanelId);
            }
          }
        }
      }

      // Reset state
      setActiveId(null);
      setActiveDragData(null);
      setOverPanelId(null);
      setDropZone(null);
      setOverGutterId(null);
      setGutterDropData(null);
      setSourcePanelId(null);
      setSourcePanelType(null);
      zoneStateRef.current = null;
    },
    [
      activeDragData,
      overPanelId,
      dropZone,
      gutterDropData,
      workspaceId,
      sourcePanelType,
      getLayout,
      splitPanel,
      openThreadInPane,
      movePanelBeside,
      swapPanelContents,
      detachTab,
      mergeTabIntoPanel,
      moveTab,
    ],
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setActiveDragData(null);
    setOverPanelId(null);
    setDropZone(null);
    setOverGutterId(null);
    setGutterDropData(null);
    setSourcePanelId(null);
    setSourcePanelType(null);
    zoneStateRef.current = null;
  }, []);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={panelCollisionDetection}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <PanelDndContext.Provider
        value={{
          activeId,
          activeDragData,
          overPanelId,
          dropZone,
          overGutterId,
          sourcePanelId,
          sourcePanelType,
        }}
      >
        {children}
      </PanelDndContext.Provider>

      {/* Animated drag overlay */}
      <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
        <AnimatePresence>
          {activeId && activeDragData && (
            <DragOverlayContent
              dragData={activeDragData}
              panelType={sourcePanelType}
              chatsMap={chatsMap}
            />
          )}
        </AnimatePresence>
      </DragOverlay>
    </DndContext>
  );
}

// Panel type to icon mapping
const PANEL_TYPE_ICONS: Record<PanelType, typeof MessageSquare> = {
  chat: MessageSquare,
  "coding-session": SquareCode,
  terminal: Terminal,
  browser: Globe,
  preview: Eye,
  tasks: Kanban,
  code: Code,
  empty: Square,
};

const PANEL_TYPE_LABELS: Record<PanelType, string> = {
  chat: "Chat",
  "coding-session": "Session",
  terminal: "Terminal",
  browser: "Browser",
  preview: "Preview",
  tasks: "Tasks",
  code: "Code",
  empty: "Empty",
};

// Small pill overlay for thread/tab drags
function PillOverlay({ icon: Icon, label }: { icon: typeof MessageSquare; label: string }) {
  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0, y: 5 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.95, opacity: 0 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className="flex items-center gap-2 px-2.5 py-1.5 bg-background/95 backdrop-blur-sm border border-border rounded-md shadow-xl max-w-48"
      style={{
        boxShadow:
          "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1), 0 0 0 1px rgb(0 0 0 / 0.05)",
      }}
    >
      <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
      <span className="text-xs font-medium truncate">{label}</span>
    </motion.div>
  );
}

// Animated drag overlay content
function DragOverlayContent({
  dragData,
  panelType,
  chatsMap,
}: {
  dragData: DragData;
  panelType: PanelType | null;
  chatsMap: Map<string, Chat>;
}) {
  // Thread drag: small pill with chat title
  if (dragData.type === "thread") {
    const chat = chatsMap.get(dragData.chatId);
    return <PillOverlay icon={MessageSquare} label={chat?.title || dragData.title || "Chat"} />;
  }

  // Tab drag: small pill with tab content title
  if (dragData.type === "tab") {
    const type = panelType || "chat";
    const Icon = PANEL_TYPE_ICONS[type];
    let label = PANEL_TYPE_LABELS[type];
    if (dragData.contentId) {
      const chat = chatsMap.get(dragData.contentId);
      if (chat?.title) label = chat.title;
    }
    return <PillOverlay icon={Icon} label={label} />;
  }

  // Pane drag: miniaturized panel preview
  const type = panelType || "chat";
  const Icon = PANEL_TYPE_ICONS[type];
  const title = PANEL_TYPE_LABELS[type];

  return (
    <motion.div
      initial={{ scale: 0.92, opacity: 0 }}
      animate={{ scale: 1, opacity: 1, rotate: 2 }}
      exit={{ scale: 0.92, opacity: 0 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className="w-[180px] h-[120px] rounded-lg border border-border bg-background/90 backdrop-blur-sm overflow-hidden"
      style={{
        boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.25), 0 0 0 1px rgb(0 0 0 / 0.05)",
      }}
    >
      {/* Mini tab bar */}
      <div className="h-6 flex items-center gap-1.5 px-2 border-b border-border bg-muted/50">
        <Icon className="h-3 w-3 text-foreground/70 shrink-0" />
        <span className="text-[10px] font-medium text-foreground/70 truncate">{title}</span>
      </div>
      {/* Content placeholder */}
      <div className="flex-1 bg-muted/20" style={{ height: "calc(100% - 24px)" }} />
    </motion.div>
  );
}
