import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PanelLayout, PanelNode, PanelType, PanelBranch, PanelLeaf } from "../types";

interface PanelState {
  layouts: Map<string, PanelLayout>;
  // Track which panel is focused per thread
  focusedPanelIds: Map<string, string>;

  getLayout: (threadId: string) => PanelLayout | undefined;
  setLayout: (threadId: string, layout: PanelLayout) => void;
  deleteLayout: (threadId: string) => void;

  // Focus tracking
  getFocusedPanelId: (threadId: string) => string | null;
  setFocusedPanelId: (threadId: string, panelId: string) => void;

  // Panel operations
  splitPanel: (
    threadId: string,
    panelId: string,
    direction: "horizontal" | "vertical",
    newPanelType: PanelType,
  ) => void;
  closePanel: (threadId: string, panelId: string) => void;
  updatePanelProps: (threadId: string, panelId: string, props: Record<string, unknown>) => void;
  resetLayout: (threadId: string) => void;
}

export const usePanelStore = create<PanelState>()(
  persist(
    (set, get) => ({
      layouts: new Map(),
      focusedPanelIds: new Map(),

      getLayout: (threadId: string) => {
        return get().layouts.get(threadId);
      },

      getFocusedPanelId: (threadId: string) => {
        const focusedId = get().focusedPanelIds.get(threadId);
        if (focusedId) return focusedId;

        // Fallback: if no focused panel tracked, find first leaf as default
        const layout = get().layouts.get(threadId);
        if (!layout) return null;

        const findFirstLeaf = (node: PanelNode): string | null => {
          if (node.type === "leaf") return node.panelId;
          return findFirstLeaf(node.children[0]) || findFirstLeaf(node.children[1]);
        };
        return findFirstLeaf(layout.root);
      },

      setFocusedPanelId: (threadId: string, panelId: string) => {
        console.log("[panel-store] setFocusedPanelId:", threadId, panelId);
        const { focusedPanelIds } = get();
        const updated = new Map(focusedPanelIds);
        updated.set(threadId, panelId);
        set({ focusedPanelIds: updated });
      },

      setLayout: (threadId: string, layout: PanelLayout) => {
        const { layouts } = get();
        const updated = new Map(layouts);
        updated.set(threadId, layout);
        set({ layouts: updated });
      },

      deleteLayout: (threadId: string) => {
        const { layouts } = get();
        const updated = new Map(layouts);
        updated.delete(threadId);
        set({ layouts: updated });
      },

      splitPanel: (
        threadId: string,
        panelId: string,
        direction: "horizontal" | "vertical",
        newPanelType: PanelType,
      ) => {
        console.log("[panel-store] splitPanel:", { threadId, panelId, direction, newPanelType });
        const layout = get().getLayout(threadId);
        if (!layout) {
          console.log("[panel-store] splitPanel: no layout found");
          return;
        }

        const newPanelId = `panel-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const newLeaf: PanelLeaf = {
          type: "leaf",
          panelId: newPanelId,
          panelType: newPanelType,
        };

        const splitNode = (node: PanelNode): PanelNode => {
          if (node.type === "leaf" && node.panelId === panelId) {
            // Replace this leaf with a branch containing the old leaf and new leaf
            const branch: PanelBranch = {
              type: "branch",
              direction,
              sizes: [50, 50], // Equal split by default
              children: [node, newLeaf],
            };
            return branch;
          }

          if (node.type === "branch") {
            // Recursively search children
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

        const newRoot = splitNode(layout.root);
        get().setLayout(threadId, {
          ...layout,
          root: newRoot,
          updatedAt: Date.now(),
        });
      },

      closePanel: (threadId: string, panelId: string) => {
        const layout = get().getLayout(threadId);
        if (!layout) return;

        // Can't close the last panel
        if (layout.root.type === "leaf") return;

        // Track which panel ID should receive focus after close
        let siblingPanelId: string | null = null;

        const removePanel = (node: PanelNode): PanelNode | null => {
          if (node.type === "leaf") {
            if (node.panelId === panelId) {
              // Return null to signal this node should be removed
              return null;
            }
            return node;
          }

          // Check children
          const [left, right] = node.children;
          const newLeft = removePanel(left);
          const newRight = removePanel(right);

          // If one child was removed, promote the sibling and track it for focus
          if (newLeft === null) {
            // Left was removed, focus on right (find first leaf in right)
            if (right.type === "leaf") {
              siblingPanelId = right.panelId;
            } else {
              // Find first leaf in right subtree
              const findFirstLeaf = (n: PanelNode): string | null => {
                if (n.type === "leaf") return n.panelId;
                return findFirstLeaf(n.children[0]) || findFirstLeaf(n.children[1]);
              };
              siblingPanelId = findFirstLeaf(right);
            }
            return newRight;
          }
          if (newRight === null) {
            // Right was removed, focus on left (find first leaf in left)
            if (left.type === "leaf") {
              siblingPanelId = left.panelId;
            } else {
              // Find first leaf in left subtree
              const findFirstLeaf = (n: PanelNode): string | null => {
                if (n.type === "leaf") return n.panelId;
                return findFirstLeaf(n.children[0]) || findFirstLeaf(n.children[1]);
              };
              siblingPanelId = findFirstLeaf(left);
            }
            return newLeft;
          }

          // Both children still exist
          return {
            ...node,
            children: [newLeft, newRight] as [PanelNode, PanelNode],
          };
        };

        const newRoot = removePanel(layout.root);
        if (newRoot) {
          get().setLayout(threadId, {
            ...layout,
            root: newRoot,
            updatedAt: Date.now(),
          });

          // Update focus to the sibling panel
          if (siblingPanelId) {
            get().setFocusedPanelId(threadId, siblingPanelId);
          }
        }
      },

      updatePanelProps: (threadId: string, panelId: string, props: Record<string, unknown>) => {
        const layout = get().getLayout(threadId);
        if (!layout) return;

        const updateProps = (node: PanelNode): PanelNode => {
          if (node.type === "leaf" && node.panelId === panelId) {
            return {
              ...node,
              props: { ...node.props, ...props },
            };
          }

          if (node.type === "branch") {
            return {
              ...node,
              children: [updateProps(node.children[0]), updateProps(node.children[1])] as [
                PanelNode,
                PanelNode,
              ],
            };
          }

          return node;
        };

        const newRoot = updateProps(layout.root);
        get().setLayout(threadId, {
          ...layout,
          root: newRoot,
          updatedAt: Date.now(),
        });
      },

      resetLayout: (threadId: string) => {
        const panelId = "panel-default-chat";
        const defaultLayout: PanelLayout = {
          id: `layout-${Date.now()}`,
          threadId,
          root: {
            type: "leaf",
            panelId,
            panelType: "chat",
          },
          updatedAt: Date.now(),
        };
        get().setLayout(threadId, defaultLayout);
        // Also set the default panel as focused
        get().setFocusedPanelId(threadId, panelId);
      },
    }),
    {
      name: "kos-panels",
      // Custom storage to handle Map serialization
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const { state } = JSON.parse(str);
          return {
            state: {
              ...state,
              layouts: new Map(state.layouts || []),
              focusedPanelIds: new Map(state.focusedPanelIds || []),
            },
          };
        },
        setItem: (name, value) => {
          const { state } = value;
          localStorage.setItem(
            name,
            JSON.stringify({
              state: {
                ...state,
                layouts: Array.from(state.layouts.entries()),
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
