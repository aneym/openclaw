import { useEffect, useState, useMemo } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import type { PanelNode } from "../../types";
import { usePanelStore } from "../../stores/panel-store";
import { PanelContent } from "./PanelContent";
import { PanelToolbar } from "./PanelToolbar";

interface PanelContainerProps {
  threadId: string;
}

export function PanelContainer({ threadId }: PanelContainerProps) {
  // Select raw Map to avoid calling method in selector (causes infinite loops)
  const layoutsMap = usePanelStore((s) => s.layouts);
  const resetLayout = usePanelStore((s) => s.resetLayout);

  // Derive layout outside selector with useMemo
  const layout = useMemo(() => layoutsMap.get(threadId), [layoutsMap, threadId]);

  // Create default layout if none exists for this thread
  useEffect(() => {
    if (!layout) {
      resetLayout(threadId);
    }
  }, [threadId, layout, resetLayout]);

  // Show loading state while layout is being created
  if (!layout) {
    return null;
  }

  return <RenderNode node={layout.root} threadId={threadId} />;
}

interface RenderNodeProps {
  node: PanelNode;
  threadId: string;
}

function RenderNode({ node, threadId }: RenderNodeProps) {
  const [isVisible, setIsVisible] = useState(false);
  const setFocusedPanelId = usePanelStore((s) => s.setFocusedPanelId);
  // Track focused panel for visual indicator
  const focusedPanelIdsMap = usePanelStore((s) => s.focusedPanelIds);
  const isFocused = useMemo(
    () => node.type === "leaf" && focusedPanelIdsMap.get(threadId) === node.panelId,
    [focusedPanelIdsMap, threadId, node],
  );

  // Trigger entrance animation on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  // Handle click to set focus on this panel
  const handleFocus = () => {
    if (node.type === "leaf") {
      setFocusedPanelId(threadId, node.panelId);
    }
  };

  // Leaf node: render the panel content with toolbar
  if (node.type === "leaf") {
    return (
      <div
        onClick={handleFocus}
        onFocus={handleFocus}
        className={`h-full w-full flex flex-col transition-all duration-200 ease-out ${
          isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95"
        } ${isFocused ? "ring-1 ring-primary/50" : ""}`}
      >
        <PanelToolbar panelId={node.panelId} panelType={node.panelType} threadId={threadId} />
        <div className="flex-1 overflow-hidden">
          <PanelContent type={node.panelType} props={node.props} threadId={threadId} />
        </div>
      </div>
    );
  }

  // Branch node: render a resizable split with two children
  return (
    <PanelGroup direction={node.direction}>
      <Panel defaultSize={node.sizes[0]} minSize={20}>
        <RenderNode node={node.children[0]} threadId={threadId} />
      </Panel>

      <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors data-[resize-handle-state=drag]:bg-primary" />

      <Panel defaultSize={node.sizes[1]} minSize={20}>
        <RenderNode node={node.children[1]} threadId={threadId} />
      </Panel>
    </PanelGroup>
  );
}
