import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  PanelLayout,
  PanelNode,
  PanelType,
  PanelState,
  PanelBranch,
  PanelLeaf,
} from "../types";

function generatePanelId(): string {
  return `panel-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
  ) => void;
  updatePanelData: (workspaceId: string, panelId: string, data: Record<string, unknown>) => void;
  resetLayout: (workspaceId: string) => void;

  // Focus tracking
  getFocusedPanelId: (workspaceId: string) => string | null;
  setFocusedPanelId: (workspaceId: string, panelId: string) => void;

  // Check if panel type exists in layout
  hasPanelType: (workspaceId: string, type: PanelType) => boolean;
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

        // Don't spawn if this panel type already exists
        const existingTypes = new Set([...layout.panels.values()].map((p) => p.type));
        if (existingTypes.has(type)) {
          console.log(`[panel-store] Panel type ${type} already exists, skipping spawn`);
          return;
        }

        const newPanelId = generatePanelId();
        const newPanelState: PanelState = {
          id: newPanelId,
          type,
          sessionId,
          data,
          isUserOpened: false,
        };

        // Find the chat panel to split (or first leaf if no chat)
        const chatPanel = [...layout.panels.values()].find((p) => p.type === "chat");
        const targetPanelId = chatPanel?.id || findFirstLeaf(layout.root);

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
      },

      closePanel: (workspaceId: string, panelId: string) => {
        const layout = get().getLayout(workspaceId);
        const panel = layout.panels.get(panelId);

        // Don't close the chat panel
        if (panel?.type === "chat") {
          console.log("[panel-store] Cannot close chat panel");
          return;
        }

        // Can't close the last panel
        if (layout.root.type === "leaf") return;

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
      ) => {
        const layout = get().getLayout(workspaceId);

        const newPanelId = generatePanelId();
        const newPanelState: PanelState = {
          id: newPanelId,
          type: newType,
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
        return [...layout.panels.values()].some((p) => p.type === type);
      },
    }),
    {
      name: "kos-panels-v2",
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const { state } = JSON.parse(str);

          // Deserialize layouts with nested Maps
          const layouts = new Map<string, PanelLayout>();
          if (state.layouts) {
            for (const [wsId, layout] of state.layouts) {
              layouts.set(wsId, {
                ...layout,
                panels: new Map(layout.panels || []),
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
          state.layouts.forEach((layout, wsId) => {
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
