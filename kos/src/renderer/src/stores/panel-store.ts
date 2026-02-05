import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  PanelLayout,
  PanelNode,
  PanelType,
  PanelState,
  PanelBranch,
  PanelLeaf,
  PanelTab,
} from "../types";
import { TABBED_PANEL_TYPES } from "../types";

function generatePanelId(): string {
  return `panel-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function generateTabId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createDefaultLayout(): PanelLayout {
  const chatPanelId = generatePanelId();
  return {
    root: { type: "leaf", panelId: chatPanelId },
    panels: new Map([
      [
        chatPanelId,
        {
          id: chatPanelId,
          type: "chat" as PanelType,
          isUserOpened: false,
        },
      ],
    ]),
  };
}

function findFirstLeaf(node: PanelNode): string | null {
  if (node.type === "leaf") return node.panelId;
  return findFirstLeaf(node.children[0]) || findFirstLeaf(node.children[1]);
}

// Collect all leaf panel IDs in tree order (left-to-right, top-to-bottom)
function collectAllLeafIds(node: PanelNode): string[] {
  if (node.type === "leaf") return [node.panelId];
  return [...collectAllLeafIds(node.children[0]), ...collectAllLeafIds(node.children[1])];
}

// Find first chat panel ID
function findFirstChatPanel(panels: Map<string, PanelState>): string | null {
  for (const [id, panel] of panels) {
    if (panel.type === "chat") return id;
  }
  return null;
}

// Remove a leaf from the tree and return the updated tree
// Returns the sibling node when a leaf is removed from a branch
function removeLeafFromTree(node: PanelNode, panelId: string): PanelNode | null {
  if (node.type === "leaf") {
    return node.panelId === panelId ? null : node;
  }

  const [left, right] = node.children;
  const newLeft = removeLeafFromTree(left, panelId);
  const newRight = removeLeafFromTree(right, panelId);

  // If one child was removed, return the other
  if (newLeft === null) return newRight;
  if (newRight === null) return newLeft;

  // Both children still exist
  return {
    ...node,
    children: [newLeft, newRight] as [PanelNode, PanelNode],
  };
}

// Insert a leaf beside another leaf in the tree
function insertLeafBeside(
  node: PanelNode,
  targetPanelId: string,
  newLeaf: PanelLeaf,
  direction: "horizontal" | "vertical",
  position: "before" | "after",
): PanelNode {
  if (node.type === "leaf") {
    if (node.panelId === targetPanelId) {
      // Insert the new leaf beside this one
      const children: [PanelNode, PanelNode] =
        position === "before" ? [newLeaf, node] : [node, newLeaf];
      const branch: PanelBranch = {
        type: "branch",
        direction,
        sizes: [50, 50],
        children,
      };
      return branch;
    }
    return node;
  }

  // Recurse into children
  return {
    ...node,
    children: [
      insertLeafBeside(node.children[0], targetPanelId, newLeaf, direction, position),
      insertLeafBeside(node.children[1], targetPanelId, newLeaf, direction, position),
    ] as [PanelNode, PanelNode],
  };
}

interface PanelStoreState {
  // Keyed by workspaceId (not threadId)
  layouts: Map<string, PanelLayout>;
  // Track focused panel per workspace
  focusedPanelIds: Map<string, string>;

  // Actions
  getLayout: (workspaceId: string) => PanelLayout;
  setLayout: (workspaceId: string, layout: PanelLayout) => void;
  spawnPanel: (
    workspaceId: string,
    type: PanelType,
    data?: Record<string, unknown>,
    sessionId?: string,
  ) => void;
  closePanel: (workspaceId: string, panelId: string) => void;
  splitPanel: (
    workspaceId: string,
    panelId: string,
    direction: "horizontal" | "vertical",
    newType: PanelType,
    data?: Record<string, unknown>,
  ) => void;
  updatePanelData: (workspaceId: string, panelId: string, data: Record<string, unknown>) => void;
  resetLayout: (workspaceId: string) => void;

  // Focus tracking
  getFocusedPanelId: (workspaceId: string) => string | null;
  setFocusedPanelId: (workspaceId: string, panelId: string) => void;

  // Check if panel type exists in layout
  hasPanelType: (workspaceId: string, type: PanelType) => boolean;

  // Thread/pane management
  openThreadInPane: (workspaceId: string, panelId: string, chatId: string) => void;
  splitPaneWithThread: (
    workspaceId: string,
    panelId: string,
    chatId: string,
    direction?: "horizontal" | "vertical",
  ) => void;
  getAllLeafIds: (workspaceId: string) => string[];
  focusNextPanel: (workspaceId: string) => void;
  focusPrevPanel: (workspaceId: string) => void;
  getFocusedChatPanelId: (workspaceId: string) => string | null;

  // DnD tree operations
  movePanelBeside: (
    workspaceId: string,
    sourcePanelId: string,
    targetPanelId: string,
    direction: "horizontal" | "vertical",
    position: "before" | "after",
  ) => void;
  swapPanelContents: (workspaceId: string, panelIdA: string, panelIdB: string) => void;

  // Panel duplication
  duplicatePanel: (
    workspaceId: string,
    panelId: string,
    direction?: "horizontal" | "vertical",
  ) => void;

  // Clear a chat panel's chatId (both data.chatId and active tab contentId)
  clearPanelChat: (workspaceId: string, panelId: string) => void;

  // Start a terminal in a tab (assigns contentId + cwd to the tab)
  startTerminalTab: (workspaceId: string, panelId: string, tabId: string, cwd?: string) => void;

  // Tab management
  addTab: (workspaceId: string, panelId: string, tab?: Partial<PanelTab>) => void;
  closeTab: (workspaceId: string, panelId: string, tabId: string) => void;
  setActiveTab: (workspaceId: string, panelId: string, tabId: string) => void;
  nextTab: (workspaceId: string, panelId: string) => void;
  prevTab: (workspaceId: string, panelId: string) => void;
  getFocusedPanel: (workspaceId: string) => PanelState | null;

  // Panel type switching (for empty panels)
  changePanelType: (workspaceId: string, panelId: string, newType: PanelType) => void;

  // Managed terminal (for AI agent control)
  openManagedTerminal: (workspaceId: string, terminalId: string, cwd?: string) => void;
}

export const usePanelStore = create<PanelStoreState>()(
  persist(
    (set, get) => ({
      layouts: new Map(),
      focusedPanelIds: new Map(),

      getLayout: (workspaceId: string) => {
        const existing = get().layouts.get(workspaceId);
        if (existing) return existing;

        // Create default layout on first access
        const defaultLayout = createDefaultLayout();
        const updated = new Map(get().layouts);
        updated.set(workspaceId, defaultLayout);
        set({ layouts: updated });
        return defaultLayout;
      },

      setLayout: (workspaceId: string, layout: PanelLayout) => {
        const updated = new Map(get().layouts);
        updated.set(workspaceId, layout);
        set({ layouts: updated });
      },

      spawnPanel: (
        workspaceId: string,
        type: PanelType,
        data?: Record<string, unknown>,
        sessionId?: string,
      ) => {
        const layout = get().getLayout(workspaceId);

        // For non-chat panels, don't spawn if this panel type already exists
        // Chat panels can be duplicated (multiple threads side by side)
        if (type !== "chat") {
          const existingTypes = new Set([...layout.panels.values()].map((p) => p.type));
          if (existingTypes.has(type)) {
            console.log(`[panel-store] Panel type ${type} already exists, skipping spawn`);
            return;
          }
        }

        const newPanelId = generatePanelId();
        const newPanelState: PanelState = {
          id: newPanelId,
          type,
          sessionId,
          data,
          isUserOpened: true,
        };

        // Find the focused panel to split (or first leaf if no focus)
        const focusedId = get().getFocusedPanelId(workspaceId);
        const targetPanelId = focusedId || findFirstLeaf(layout.root);

        if (!targetPanelId) {
          console.error("[panel-store] No panel to split");
          return;
        }

        // Split horizontally (new panel on right)
        const newLeaf: PanelLeaf = { type: "leaf", panelId: newPanelId };

        const splitNode = (node: PanelNode): PanelNode => {
          if (node.type === "leaf" && node.panelId === targetPanelId) {
            const branch: PanelBranch = {
              type: "branch",
              direction: "horizontal",
              sizes: [60, 40],
              children: [node, newLeaf],
            };
            return branch;
          }
          if (node.type === "branch") {
            return {
              ...node,
              children: [splitNode(node.children[0]), splitNode(node.children[1])] as [
                PanelNode,
                PanelNode,
              ],
            };
          }
          return node;
        };

        const newPanels = new Map(layout.panels);
        newPanels.set(newPanelId, newPanelState);

        get().setLayout(workspaceId, {
          root: splitNode(layout.root),
          panels: newPanels,
        });

        // Focus the new panel
        get().setFocusedPanelId(workspaceId, newPanelId);
      },

      closePanel: (workspaceId: string, panelId: string) => {
        const layout = get().getLayout(workspaceId);
        const panel = layout.panels.get(panelId);
        if (!panel) return;

        // Can't close the last panel
        if (layout.root.type === "leaf") {
          console.log("[panel-store] Cannot close last panel");
          return;
        }

        // For chat panels, ensure at least one chat panel remains
        if (panel.type === "chat") {
          const chatPanels = [...layout.panels.values()].filter((p) => p.type === "chat");
          if (chatPanels.length <= 1) {
            console.log("[panel-store] Cannot close last chat panel");
            return;
          }
        }

        // Kill terminal PTY(s) when intentionally closing (not just HMR detach)
        if (panel.type === "terminal") {
          // Kill all tab terminals if tabbed
          if (panel.tabs && panel.tabs.length > 0) {
            for (const tab of panel.tabs) {
              if (tab.contentId) {
                console.log(`[panel-store] Killing terminal tab: ${tab.contentId}`);
                window.api.terminal.kill(tab.contentId).catch(() => {});
              }
            }
          }
          // Also kill the panel-based terminal ID (non-tabbed fallback)
          const terminalId = `term-${panelId}`;
          console.log(`[panel-store] Killing terminal: ${terminalId}`);
          window.api.terminal.kill(terminalId).catch(() => {
            // Terminal may not exist (e.g., never connected)
          });
        }

        let siblingPanelId: string | null = null;

        const removePanel = (node: PanelNode): PanelNode | null => {
          if (node.type === "leaf") {
            if (node.panelId === panelId) return null;
            return node;
          }

          const [left, right] = node.children;
          const newLeft = removePanel(left);
          const newRight = removePanel(right);

          if (newLeft === null) {
            siblingPanelId = findFirstLeaf(right);
            return newRight;
          }
          if (newRight === null) {
            siblingPanelId = findFirstLeaf(left);
            return newLeft;
          }

          return {
            ...node,
            children: [newLeft, newRight] as [PanelNode, PanelNode],
          };
        };

        const newRoot = removePanel(layout.root);
        if (newRoot) {
          const newPanels = new Map(layout.panels);
          newPanels.delete(panelId);

          get().setLayout(workspaceId, {
            root: newRoot,
            panels: newPanels,
          });

          if (siblingPanelId) {
            get().setFocusedPanelId(workspaceId, siblingPanelId);
          }
        }
      },

      splitPanel: (
        workspaceId: string,
        panelId: string,
        direction: "horizontal" | "vertical",
        newType: PanelType,
        data?: Record<string, unknown>,
      ) => {
        const layout = get().getLayout(workspaceId);

        const newPanelId = generatePanelId();
        const newPanelState: PanelState = {
          id: newPanelId,
          type: newType,
          data,
          isUserOpened: true,
        };

        const newLeaf: PanelLeaf = { type: "leaf", panelId: newPanelId };

        const splitNode = (node: PanelNode): PanelNode => {
          if (node.type === "leaf" && node.panelId === panelId) {
            const branch: PanelBranch = {
              type: "branch",
              direction,
              sizes: [50, 50],
              children: [node, newLeaf],
            };
            return branch;
          }
          if (node.type === "branch") {
            return {
              ...node,
              children: [splitNode(node.children[0]), splitNode(node.children[1])] as [
                PanelNode,
                PanelNode,
              ],
            };
          }
          return node;
        };

        const newPanels = new Map(layout.panels);
        newPanels.set(newPanelId, newPanelState);

        get().setLayout(workspaceId, {
          root: splitNode(layout.root),
          panels: newPanels,
        });

        // Focus the new panel
        get().setFocusedPanelId(workspaceId, newPanelId);
      },

      updatePanelData: (workspaceId: string, panelId: string, data: Record<string, unknown>) => {
        const layout = get().getLayout(workspaceId);
        const panel = layout.panels.get(panelId);
        if (!panel) return;

        const newPanels = new Map(layout.panels);
        newPanels.set(panelId, {
          ...panel,
          data: { ...panel.data, ...data },
        });

        get().setLayout(workspaceId, {
          ...layout,
          panels: newPanels,
        });
      },

      resetLayout: (workspaceId: string) => {
        const defaultLayout = createDefaultLayout();
        get().setLayout(workspaceId, defaultLayout);
        const chatPanelId = findFirstLeaf(defaultLayout.root);
        if (chatPanelId) {
          get().setFocusedPanelId(workspaceId, chatPanelId);
        }
      },

      getFocusedPanelId: (workspaceId: string) => {
        const focusedId = get().focusedPanelIds.get(workspaceId);
        if (focusedId) return focusedId;

        // Fallback: find first leaf
        const layout = get().layouts.get(workspaceId);
        if (!layout) return null;
        return findFirstLeaf(layout.root);
      },

      setFocusedPanelId: (workspaceId: string, panelId: string) => {
        const updated = new Map(get().focusedPanelIds);
        updated.set(workspaceId, panelId);
        set({ focusedPanelIds: updated });
      },

      hasPanelType: (workspaceId: string, type: PanelType) => {
        const layout = get().layouts.get(workspaceId);
        if (!layout) return false;
        // Only check panels that are actually in the render tree (not orphaned in the Map)
        const leafIds = new Set(collectAllLeafIds(layout.root));
        return [...layout.panels.entries()].some(([id, p]) => p.type === type && leafIds.has(id));
      },

      // Open a thread in a specific pane (updates panel data with chatId)
      openThreadInPane: (workspaceId: string, panelId: string, chatId: string) => {
        console.log("[panel-store] openThreadInPane called", { workspaceId, panelId, chatId });
        const layout = get().getLayout(workspaceId);
        const panel = layout.panels.get(panelId);
        console.log(
          "[panel-store] openThreadInPane - layout exists:",
          !!layout,
          "panel exists:",
          !!panel,
        );
        if (!panel) {
          console.warn("[panel-store] openThreadInPane - panel not found!");
          return;
        }

        // Only update chat panels
        if (panel.type !== "chat") {
          console.log("[panel-store] Can only set thread on chat panels, got:", panel.type);
          return;
        }

        // Check if this chat is already open in another pane (check both data.chatId and tab.contentId)
        for (const [pId, p] of layout.panels) {
          if (pId !== panelId && p.type === "chat") {
            // Check data.chatId (legacy/non-tabbed panels)
            if (p.data?.chatId === chatId) {
              console.log(
                "[panel-store] Chat already open in another pane (data.chatId), focusing that pane",
              );
              get().setFocusedPanelId(workspaceId, pId);
              return;
            }
            // Check tab.contentId (tabbed panels)
            if (p.tabs?.some((t) => t.contentId === chatId)) {
              console.log(
                "[panel-store] Chat already open in another pane (tab.contentId), focusing that pane",
              );
              get().setFocusedPanelId(workspaceId, pId);
              return;
            }
          }
        }

        console.log("[panel-store] openThreadInPane - updating panel", {
          panelId,
          oldChatId: panel.data?.chatId,
          newChatId: chatId,
          hasTabsArray: !!panel.tabs,
        });

        // For tabbed panels, also update the active tab's contentId
        let updatedTabs = panel.tabs;
        if (panel.tabs && panel.activeTabId) {
          updatedTabs = panel.tabs.map((t) =>
            t.id === panel.activeTabId ? { ...t, contentId: chatId } : t,
          );
        }

        const newPanels = new Map(layout.panels);
        newPanels.set(panelId, {
          ...panel,
          tabs: updatedTabs,
          data: { ...panel.data, chatId },
        });

        get().setLayout(workspaceId, {
          ...layout,
          panels: newPanels,
        });

        // Focus this panel
        get().setFocusedPanelId(workspaceId, panelId);
        console.log("[panel-store] openThreadInPane - done");
      },

      // Split a pane and open a thread in the new pane (Cmd+Click behavior)
      splitPaneWithThread: (
        workspaceId: string,
        panelId: string,
        chatId: string,
        direction: "horizontal" | "vertical" = "horizontal",
      ) => {
        // Check if this chat is already open in any pane
        const layout = get().getLayout(workspaceId);
        for (const [pId, p] of layout.panels) {
          if (p.type === "chat" && p.data?.chatId === chatId) {
            console.log("[panel-store] Chat already open in a pane, focusing that pane instead");
            get().setFocusedPanelId(workspaceId, pId);
            return;
          }
        }
        // Use existing splitPanel with chat type and chatId in data
        get().splitPanel(workspaceId, panelId, direction, "chat", { chatId });
      },

      // Get all leaf panel IDs in tree order
      getAllLeafIds: (workspaceId: string) => {
        const layout = get().layouts.get(workspaceId);
        if (!layout) return [];
        return collectAllLeafIds(layout.root);
      },

      // Focus next panel (cycles through all leaves)
      focusNextPanel: (workspaceId: string) => {
        const layout = get().layouts.get(workspaceId);
        if (!layout) return;

        const leafIds = collectAllLeafIds(layout.root);
        if (leafIds.length === 0) return;

        const currentFocused = get().getFocusedPanelId(workspaceId);
        const currentIndex = currentFocused ? leafIds.indexOf(currentFocused) : -1;
        const nextIndex = (currentIndex + 1) % leafIds.length;

        get().setFocusedPanelId(workspaceId, leafIds[nextIndex]);
      },

      // Focus previous panel (cycles through all leaves)
      focusPrevPanel: (workspaceId: string) => {
        const layout = get().layouts.get(workspaceId);
        if (!layout) return;

        const leafIds = collectAllLeafIds(layout.root);
        if (leafIds.length === 0) return;

        const currentFocused = get().getFocusedPanelId(workspaceId);
        const currentIndex = currentFocused ? leafIds.indexOf(currentFocused) : 0;
        const prevIndex = (currentIndex - 1 + leafIds.length) % leafIds.length;

        get().setFocusedPanelId(workspaceId, leafIds[prevIndex]);
      },

      // Get the focused panel if it's a chat, otherwise find first chat panel
      getFocusedChatPanelId: (workspaceId: string) => {
        const layout = get().layouts.get(workspaceId);
        if (!layout) return null;

        const focusedId = get().getFocusedPanelId(workspaceId);
        if (focusedId) {
          const panel = layout.panels.get(focusedId);
          if (panel?.type === "chat") return focusedId;
        }

        // Fallback to first chat panel
        return findFirstChatPanel(layout.panels);
      },

      // Move a panel beside another panel (for drag-and-drop)
      movePanelBeside: (
        workspaceId: string,
        sourcePanelId: string,
        targetPanelId: string,
        direction: "horizontal" | "vertical",
        position: "before" | "after",
      ) => {
        if (sourcePanelId === targetPanelId) return;

        const layout = get().getLayout(workspaceId);
        const sourcePanel = layout.panels.get(sourcePanelId);
        if (!sourcePanel) return;

        // Step 1: Remove source from tree
        const treeWithoutSource = removeLeafFromTree(layout.root, sourcePanelId);
        if (!treeWithoutSource) {
          // Source was the only panel - can't move
          return;
        }

        // Step 2: Insert source beside target
        const sourceLeaf: PanelLeaf = { type: "leaf", panelId: sourcePanelId };
        const newRoot = insertLeafBeside(
          treeWithoutSource,
          targetPanelId,
          sourceLeaf,
          direction,
          position,
        );

        get().setLayout(workspaceId, {
          root: newRoot,
          panels: layout.panels, // Panels map stays the same
        });

        // Focus the moved panel
        get().setFocusedPanelId(workspaceId, sourcePanelId);
      },

      // Swap contents between two panels (for center drops)
      swapPanelContents: (workspaceId: string, panelIdA: string, panelIdB: string) => {
        if (panelIdA === panelIdB) return;

        const layout = get().getLayout(workspaceId);
        const panelA = layout.panels.get(panelIdA);
        const panelB = layout.panels.get(panelIdB);
        if (!panelA || !panelB) return;

        // Swap the data (which includes chatId for chat panels)
        const newPanels = new Map(layout.panels);
        newPanels.set(panelIdA, {
          ...panelA,
          data: panelB.data,
        });
        newPanels.set(panelIdB, {
          ...panelB,
          data: panelA.data,
        });

        get().setLayout(workspaceId, {
          ...layout,
          panels: newPanels,
        });
      },

      // Duplicate focused panel (for Cmd+D) - duplicates ANY panel type
      duplicatePanel: (
        workspaceId: string,
        panelId: string,
        direction: "horizontal" | "vertical" = "horizontal",
      ) => {
        const layout = get().getLayout(workspaceId);
        const panel = layout.panels.get(panelId);
        if (!panel) return;

        const newPanelId = generatePanelId();

        // For tabbed panel types, create a panel with a single empty tab
        const isTabbed = TABBED_PANEL_TYPES.includes(panel.type);
        const newTabId = isTabbed ? generateTabId() : undefined;

        const newPanelState: PanelState = {
          id: newPanelId,
          type: panel.type,
          isUserOpened: true,
          // For tabbed panels, create with one empty tab
          tabs: isTabbed ? [{ id: newTabId! }] : undefined,
          activeTabId: newTabId,
        };

        const newLeaf: PanelLeaf = { type: "leaf", panelId: newPanelId };

        const splitNode = (node: PanelNode): PanelNode => {
          if (node.type === "leaf" && node.panelId === panelId) {
            const branch: PanelBranch = {
              type: "branch",
              direction,
              sizes: [50, 50],
              children: [node, newLeaf],
            };
            return branch;
          }
          if (node.type === "branch") {
            return {
              ...node,
              children: [splitNode(node.children[0]), splitNode(node.children[1])] as [
                PanelNode,
                PanelNode,
              ],
            };
          }
          return node;
        };

        const newPanels = new Map(layout.panels);
        newPanels.set(newPanelId, newPanelState);

        get().setLayout(workspaceId, {
          root: splitNode(layout.root),
          panels: newPanels,
        });

        // Focus the new panel
        get().setFocusedPanelId(workspaceId, newPanelId);
      },

      // Clear a chat panel's chatId (both data.chatId and active tab contentId)
      clearPanelChat: (workspaceId: string, panelId: string) => {
        const layout = get().getLayout(workspaceId);
        const panel = layout.panels.get(panelId);
        if (!panel || panel.type !== "chat") return;

        // Clear active tab's contentId
        let updatedTabs = panel.tabs;
        if (panel.tabs && panel.activeTabId) {
          updatedTabs = panel.tabs.map((t) =>
            t.id === panel.activeTabId ? { ...t, contentId: undefined } : t,
          );
        }

        const newPanels = new Map(layout.panels);
        newPanels.set(panelId, {
          ...panel,
          tabs: updatedTabs,
          data: { ...panel.data, chatId: undefined },
        });

        get().setLayout(workspaceId, {
          ...layout,
          panels: newPanels,
        });
      },

      // Start a terminal in a tab (assigns contentId + cwd to the tab)
      startTerminalTab: (workspaceId: string, panelId: string, tabId: string, cwd?: string) => {
        const layout = get().getLayout(workspaceId);
        const panel = layout.panels.get(panelId);
        if (!panel || !panel.tabs) return;

        const terminalId = `term-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const newTabs = panel.tabs.map((t) =>
          t.id === tabId ? { ...t, contentId: terminalId, data: { cwd } } : t,
        );

        const newPanels = new Map(layout.panels);
        newPanels.set(panelId, {
          ...panel,
          tabs: newTabs,
        });

        get().setLayout(workspaceId, {
          ...layout,
          panels: newPanels,
        });
      },

      // Add a tab to a panel (for Cmd+T on tabbed panels)
      addTab: (workspaceId: string, panelId: string, tab?: Partial<PanelTab>) => {
        const layout = get().getLayout(workspaceId);
        const panel = layout.panels.get(panelId);
        if (!panel) return;

        // Only allow tabs on tabbed panel types
        if (!TABBED_PANEL_TYPES.includes(panel.type)) {
          console.log(`[panel-store] Cannot add tab to non-tabbed panel type: ${panel.type}`);
          return;
        }

        const newTabId = generateTabId();
        const newTab: PanelTab = {
          id: newTabId,
          contentId: tab?.contentId,
          data: tab?.data,
        };

        const existingTabs = panel.tabs || [];
        const newPanels = new Map(layout.panels);
        newPanels.set(panelId, {
          ...panel,
          tabs: [...existingTabs, newTab],
          activeTabId: newTabId,
        });

        get().setLayout(workspaceId, {
          ...layout,
          panels: newPanels,
        });
      },

      // Close a tab within a panel
      closeTab: (workspaceId: string, panelId: string, tabId: string) => {
        const layout = get().getLayout(workspaceId);
        const panel = layout.panels.get(panelId);
        if (!panel || !panel.tabs) return;

        const tab = panel.tabs.find((t) => t.id === tabId);
        const tabIndex = panel.tabs.findIndex((t) => t.id === tabId);
        if (tabIndex === -1) return;

        // Kill terminal PTY for this tab if it's a terminal
        if (panel.type === "terminal" && tab?.contentId) {
          console.log(`[panel-store] Killing terminal tab: ${tab.contentId}`);
          window.api.terminal.kill(tab.contentId).catch(() => {
            // Terminal may not exist
          });
        }

        // If this is the last tab, close the panel instead
        if (panel.tabs.length === 1) {
          get().closePanel(workspaceId, panelId);
          return;
        }

        const newTabs = panel.tabs.filter((t) => t.id !== tabId);

        // If closing the active tab, switch to adjacent tab
        let newActiveTabId = panel.activeTabId;
        if (panel.activeTabId === tabId) {
          // Prefer tab to the left, or right if none
          const newIndex = Math.min(tabIndex, newTabs.length - 1);
          newActiveTabId = newTabs[newIndex]?.id;
        }

        const newPanels = new Map(layout.panels);
        newPanels.set(panelId, {
          ...panel,
          tabs: newTabs,
          activeTabId: newActiveTabId,
        });

        get().setLayout(workspaceId, {
          ...layout,
          panels: newPanels,
        });
      },

      // Set the active tab within a panel
      setActiveTab: (workspaceId: string, panelId: string, tabId: string) => {
        const layout = get().getLayout(workspaceId);
        const panel = layout.panels.get(panelId);
        if (!panel || !panel.tabs) return;

        // Verify tab exists
        if (!panel.tabs.some((t) => t.id === tabId)) return;

        const newPanels = new Map(layout.panels);
        newPanels.set(panelId, {
          ...panel,
          activeTabId: tabId,
        });

        get().setLayout(workspaceId, {
          ...layout,
          panels: newPanels,
        });
      },

      // Navigate to next tab (Ctrl+Tab)
      nextTab: (workspaceId: string, panelId: string) => {
        const layout = get().getLayout(workspaceId);
        const panel = layout.panels.get(panelId);
        if (!panel || !panel.tabs || panel.tabs.length <= 1) return;

        const currentIndex = panel.tabs.findIndex((t) => t.id === panel.activeTabId);
        const nextIndex = (currentIndex + 1) % panel.tabs.length;
        get().setActiveTab(workspaceId, panelId, panel.tabs[nextIndex].id);
      },

      // Navigate to previous tab (Ctrl+Shift+Tab)
      prevTab: (workspaceId: string, panelId: string) => {
        const layout = get().getLayout(workspaceId);
        const panel = layout.panels.get(panelId);
        if (!panel || !panel.tabs || panel.tabs.length <= 1) return;

        const currentIndex = panel.tabs.findIndex((t) => t.id === panel.activeTabId);
        const prevIndex = (currentIndex - 1 + panel.tabs.length) % panel.tabs.length;
        get().setActiveTab(workspaceId, panelId, panel.tabs[prevIndex].id);
      },

      // Get the focused panel state
      getFocusedPanel: (workspaceId: string) => {
        const focusedId = get().getFocusedPanelId(workspaceId);
        if (!focusedId) return null;
        const layout = get().layouts.get(workspaceId);
        if (!layout) return null;
        return layout.panels.get(focusedId) || null;
      },

      // Change a panel's type (for switching empty panels before content is assigned)
      changePanelType: (workspaceId: string, panelId: string, newType: PanelType) => {
        const layout = get().getLayout(workspaceId);
        const panel = layout.panels.get(panelId);
        if (!panel) return;

        // Don't change if same type
        if (panel.type === newType) return;

        const newTabId = TABBED_PANEL_TYPES.includes(newType) ? generateTabId() : undefined;

        const newPanelState: PanelState = {
          id: panelId,
          type: newType,
          isUserOpened: panel.isUserOpened,
          // Clear data when changing type, but set up tabs if needed
          tabs: newTabId ? [{ id: newTabId }] : undefined,
          activeTabId: newTabId,
        };

        const newPanels = new Map(layout.panels);
        newPanels.set(panelId, newPanelState);

        get().setLayout(workspaceId, {
          ...layout,
          panels: newPanels,
        });
      },

      // Open a managed terminal panel (for AI agent control)
      openManagedTerminal: (workspaceId: string, terminalId: string, cwd?: string) => {
        const layout = get().getLayout(workspaceId);

        const newPanelId = generatePanelId();
        const newTabId = generateTabId();

        const newPanelState: PanelState = {
          id: newPanelId,
          type: "terminal",
          isUserOpened: false, // Opened by AI, not user
          data: {
            managed: true,
            cwd,
          },
          tabs: [
            {
              id: newTabId,
              contentId: terminalId,
              data: { cwd, managed: true },
            },
          ],
          activeTabId: newTabId,
        };

        // Find the focused panel to split (or first leaf if no focus)
        const focusedId = get().getFocusedPanelId(workspaceId);
        const targetPanelId = focusedId || findFirstLeaf(layout.root);

        if (!targetPanelId) {
          console.error("[panel-store] No panel to split for managed terminal");
          return;
        }

        // Split horizontally (new panel on right)
        const newLeaf: PanelLeaf = { type: "leaf", panelId: newPanelId };

        const splitNode = (node: PanelNode): PanelNode => {
          if (node.type === "leaf" && node.panelId === targetPanelId) {
            const branch: PanelBranch = {
              type: "branch",
              direction: "horizontal",
              sizes: [60, 40],
              children: [node, newLeaf],
            };
            return branch;
          }
          if (node.type === "branch") {
            return {
              ...node,
              children: [splitNode(node.children[0]), splitNode(node.children[1])] as [
                PanelNode,
                PanelNode,
              ],
            };
          }
          return node;
        };

        const newPanels = new Map(layout.panels);
        newPanels.set(newPanelId, newPanelState);

        get().setLayout(workspaceId, {
          root: splitNode(layout.root),
          panels: newPanels,
        });

        // Focus the new panel
        get().setFocusedPanelId(workspaceId, newPanelId);
        console.log(
          `[panel-store] Opened managed terminal panel: panelId=${newPanelId}, terminalId=${terminalId}`,
        );
      },
    }),
    {
      name: "kos-panels-v2",
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const { state } = JSON.parse(str);

          // Deserialize layouts with nested Maps and clean up orphaned panels
          const layouts = new Map<string, PanelLayout>();
          if (state.layouts) {
            for (const [wsId, layout] of state.layouts) {
              const panels = new Map<string, PanelState>(layout.panels || []);
              // Clean up orphaned panels (in Map but not in tree)
              const treeLeafIds = new Set(collectAllLeafIds(layout.root));
              for (const panelId of panels.keys()) {
                if (!treeLeafIds.has(panelId)) {
                  console.log(`[panel-store] Cleaning up orphaned panel: ${panelId}`);
                  panels.delete(panelId);
                }
              }
              layouts.set(wsId, {
                ...layout,
                panels,
              });
            }
          }

          return {
            state: {
              ...state,
              layouts,
              focusedPanelIds: new Map(state.focusedPanelIds || []),
            },
          };
        },
        setItem: (name, value) => {
          const { state } = value;

          // Serialize layouts with nested Maps
          const layoutsArray: [string, { root: PanelNode; panels: [string, PanelState][] }][] = [];
          state.layouts.forEach((layout: PanelLayout, wsId: string) => {
            layoutsArray.push([
              wsId,
              {
                root: layout.root,
                panels: Array.from(layout.panels.entries()),
              },
            ]);
          });

          localStorage.setItem(
            name,
            JSON.stringify({
              state: {
                ...state,
                layouts: layoutsArray,
                focusedPanelIds: Array.from(state.focusedPanelIds.entries()),
              },
            }),
          );
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    },
  ),
);
