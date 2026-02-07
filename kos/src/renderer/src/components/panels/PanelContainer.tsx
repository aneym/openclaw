import { useEffect, useMemo, useCallback } from "react";
import { Panel, PanelGroup } from "react-resizable-panels";
import type { PanelLayout, PanelNode, PanelState } from "../../types";
import { scaleIn, slideFromRight, slideFromBottom } from "../../lib/animation-variants";
import { motion } from "../../lib/motion";
import { usePanelStore } from "../../stores/panel-store";
import { DroppableGutter } from "./DroppableGutter";
import { DroppablePane } from "./DroppablePane";
import { PanelContent } from "./PanelContent";
import { PanelDndProvider } from "./PanelDndProvider";
import { PanelTabBar } from "./PanelTabBar";

interface PanelContainerProps {
  workspaceId: string;
  activeChatId?: string;
}

export function PanelContainer({ workspaceId, activeChatId }: PanelContainerProps) {
  // Select raw Map to avoid calling method in selector (causes infinite loops)
  const layoutsMap = usePanelStore((s) => s.layouts);
  const resetLayout = usePanelStore((s) => s.resetLayout);

  // Derive layout outside selector with useMemo
  const layout = useMemo(
    () => layoutsMap.get(workspaceId) as PanelLayout | undefined,
    [layoutsMap, workspaceId],
  );

  // Create default layout if none exists for this workspace
  useEffect(() => {
    if (!layout) {
      resetLayout(workspaceId);
    }
  }, [workspaceId, layout, resetLayout]);

  // Show loading state while layout is being created
  if (!layout) {
    return null;
  }

  return (
    <PanelDndProvider workspaceId={workspaceId}>
      <RenderNode
        node={layout.root}
        panels={layout.panels}
        workspaceId={workspaceId}
        activeChatId={activeChatId}
        path=""
      />
    </PanelDndProvider>
  );
}

interface RenderNodeProps {
  node: PanelNode;
  panels: Map<string, PanelState>;
  workspaceId: string;
  activeChatId?: string;
  /** Path identifier for generating unique gutter IDs */
  path: string;
  /** Entry direction for animation (set when this is the "new" panel from a split) */
  entryDirection?: "horizontal" | "vertical";
}

function RenderNode({
  node,
  panels,
  workspaceId,
  activeChatId,
  path,
  entryDirection,
}: RenderNodeProps) {
  const setFocusedPanelId = usePanelStore((s) => s.setFocusedPanelId);
  const closePanel = usePanelStore((s) => s.closePanel);
  // Track focused panel for visual indicator
  const focusedPanelIdsMap = usePanelStore((s) => s.focusedPanelIds);

  // Derive panelId once for leaf nodes
  const panelId = node.type === "leaf" ? node.panelId : null;

  const isFocused = useMemo(
    () => panelId !== null && focusedPanelIdsMap.get(workspaceId) === panelId,
    [focusedPanelIdsMap, workspaceId, panelId],
  );

  // Stable callback to set focus on this panel
  const handleFocus = useCallback(() => {
    if (panelId) {
      setFocusedPanelId(workspaceId, panelId);
    }
  }, [panelId, workspaceId, setFocusedPanelId]);

  // Leaf node: render the panel content with toolbar
  if (node.type === "leaf") {
    const panelState = panels.get(node.panelId);
    if (!panelState) {
      return (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          Panel not found
        </div>
      );
    }

    // Check if this chat panel can be closed (not the last one)
    const canClose = (() => {
      if (panelState.type !== "chat") return true;
      const chatPanels = [...panels.values()].filter((p) => p.type === "chat");
      return chatPanels.length > 1;
    })();

    // Pick animation based on entry direction (how this panel was split in)
    const variants =
      entryDirection === "horizontal"
        ? slideFromRight
        : entryDirection === "vertical"
          ? slideFromBottom
          : scaleIn;

    return (
      <DroppablePane panelId={node.panelId} panelType={panelState.type}>
        <motion.div
          key={node.panelId}
          variants={variants}
          initial="initial"
          animate="animate"
          onClick={handleFocus}
          onFocus={handleFocus}
          className={`h-full w-full flex flex-col overflow-hidden border-2 transition-colors duration-150 ${isFocused ? "border-primary/30" : "border-transparent hover:border-border/50"}`}
        >
          <PanelTabBar
            panelId={node.panelId}
            panelType={panelState.type}
            workspaceId={workspaceId}
            activeChatId={activeChatId}
            panelData={panelState.data}
            tabs={panelState.tabs}
            activeTabId={panelState.activeTabId}
            onClose={canClose ? () => closePanel(workspaceId, node.panelId) : undefined}
          />
          <div className="flex-1 overflow-hidden">
            <PanelContent
              type={panelState.type}
              panelId={node.panelId}
              data={panelState.data}
              workspaceId={workspaceId}
              activeChatId={activeChatId}
              tabs={panelState.tabs}
              activeTabId={panelState.activeTabId}
              isFocused={isFocused}
            />
          </div>
        </motion.div>
      </DroppablePane>
    );
  }

  // Branch node: render a resizable split with two children
  // Get leaf panel IDs for gutter drop handling
  // "before" = rightmost/bottommost leaf of the first child
  // "after" = leftmost/topmost leaf of the second child
  const beforeLeafId = getLastLeafPanelId(node.children[0]);
  const afterLeafId = getFirstLeafPanelId(node.children[1]);
  const gutterId = `${path}gutter`;

  return (
    <PanelGroup direction={node.direction}>
      <Panel defaultSize={node.sizes[0]} minSize={15}>
        <RenderNode
          node={node.children[0]}
          panels={panels}
          workspaceId={workspaceId}
          activeChatId={activeChatId}
          path={`${path}0-`}
        />
      </Panel>

      <DroppableGutter
        gutterId={gutterId}
        direction={node.direction}
        beforePanelId={beforeLeafId}
        afterPanelId={afterLeafId}
      />

      <Panel defaultSize={node.sizes[1]} minSize={15}>
        <RenderNode
          node={node.children[1]}
          panels={panels}
          workspaceId={workspaceId}
          activeChatId={activeChatId}
          path={`${path}1-`}
          entryDirection={node.direction}
        />
      </Panel>
    </PanelGroup>
  );
}

/**
 * Get the first (leftmost/topmost) leaf panel ID from a node tree.
 * Used for determining which panel a gutter is adjacent to.
 */
function getFirstLeafPanelId(node: PanelNode): string {
  if (node.type === "leaf") {
    return node.panelId;
  }
  return getFirstLeafPanelId(node.children[0]);
}

/**
 * Get the last (rightmost/bottommost) leaf panel ID from a node tree.
 */
function getLastLeafPanelId(node: PanelNode): string {
  if (node.type === "leaf") {
    return node.panelId;
  }
  return getLastLeafPanelId(node.children[1]);
}
