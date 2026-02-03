import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PanelLayout, PanelNode, PanelType, PanelBranch, PanelLeaf } from '../types'

interface PanelState {
  layouts: Map<string, PanelLayout>

  getLayout: (threadId: string) => PanelLayout | undefined
  setLayout: (threadId: string, layout: PanelLayout) => void
  deleteLayout: (threadId: string) => void

  // Panel operations
  splitPanel: (
    threadId: string,
    panelId: string,
    direction: 'horizontal' | 'vertical',
    newPanelType: PanelType
  ) => void
  closePanel: (threadId: string, panelId: string) => void
  updatePanelProps: (threadId: string, panelId: string, props: Record<string, unknown>) => void
  resetLayout: (threadId: string) => void
}

export const usePanelStore = create<PanelState>()(
  persist(
    (set, get) => ({
      layouts: new Map(),

      getLayout: (threadId: string) => {
        return get().layouts.get(threadId)
      },

      setLayout: (threadId: string, layout: PanelLayout) => {
        const { layouts } = get()
        const updated = new Map(layouts)
        updated.set(threadId, layout)
        set({ layouts: updated })
      },

      deleteLayout: (threadId: string) => {
        const { layouts } = get()
        const updated = new Map(layouts)
        updated.delete(threadId)
        set({ layouts: updated })
      },

      splitPanel: (
        threadId: string,
        panelId: string,
        direction: 'horizontal' | 'vertical',
        newPanelType: PanelType
      ) => {
        const layout = get().getLayout(threadId)
        if (!layout) return

        const newPanelId = `panel-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        const newLeaf: PanelLeaf = {
          type: 'leaf',
          panelId: newPanelId,
          panelType: newPanelType
        }

        const splitNode = (node: PanelNode): PanelNode => {
          if (node.type === 'leaf' && node.panelId === panelId) {
            // Replace this leaf with a branch containing the old leaf and new leaf
            const branch: PanelBranch = {
              type: 'branch',
              direction,
              sizes: [50, 50], // Equal split by default
              children: [node, newLeaf]
            }
            return branch
          }

          if (node.type === 'branch') {
            // Recursively search children
            return {
              ...node,
              children: [splitNode(node.children[0]), splitNode(node.children[1])] as [
                PanelNode,
                PanelNode
              ]
            }
          }

          return node
        }

        const newRoot = splitNode(layout.root)
        get().setLayout(threadId, {
          ...layout,
          root: newRoot,
          updatedAt: Date.now()
        })
      },

      closePanel: (threadId: string, panelId: string) => {
        const layout = get().getLayout(threadId)
        if (!layout) return

        // Can't close the last panel
        if (layout.root.type === 'leaf') return

        const removePanel = (node: PanelNode): PanelNode | null => {
          if (node.type === 'leaf') {
            if (node.panelId === panelId) {
              // Return null to signal this node should be removed
              return null
            }
            return node
          }

          // Check children
          const [left, right] = node.children
          const newLeft = removePanel(left)
          const newRight = removePanel(right)

          // If one child was removed, promote the sibling
          if (newLeft === null) return newRight
          if (newRight === null) return newLeft

          // Both children still exist
          return {
            ...node,
            children: [newLeft, newRight] as [PanelNode, PanelNode]
          }
        }

        const newRoot = removePanel(layout.root)
        if (newRoot) {
          get().setLayout(threadId, {
            ...layout,
            root: newRoot,
            updatedAt: Date.now()
          })
        }
      },

      updatePanelProps: (threadId: string, panelId: string, props: Record<string, unknown>) => {
        const layout = get().getLayout(threadId)
        if (!layout) return

        const updateProps = (node: PanelNode): PanelNode => {
          if (node.type === 'leaf' && node.panelId === panelId) {
            return {
              ...node,
              props: { ...node.props, ...props }
            }
          }

          if (node.type === 'branch') {
            return {
              ...node,
              children: [updateProps(node.children[0]), updateProps(node.children[1])] as [
                PanelNode,
                PanelNode
              ]
            }
          }

          return node
        }

        const newRoot = updateProps(layout.root)
        get().setLayout(threadId, {
          ...layout,
          root: newRoot,
          updatedAt: Date.now()
        })
      },

      resetLayout: (threadId: string) => {
        const defaultLayout: PanelLayout = {
          id: `layout-${Date.now()}`,
          threadId,
          root: {
            type: 'leaf',
            panelId: 'panel-default-chat',
            panelType: 'chat'
          },
          updatedAt: Date.now()
        }
        get().setLayout(threadId, defaultLayout)
      }
    }),
    {
      name: 'kos-panels',
      // Custom storage to handle Map serialization
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name)
          if (!str) return null
          const { state } = JSON.parse(str)
          return {
            state: {
              ...state,
              layouts: new Map(state.layouts || [])
            }
          }
        },
        setItem: (name, value) => {
          const { state } = value
          localStorage.setItem(
            name,
            JSON.stringify({
              state: {
                ...state,
                layouts: Array.from(state.layouts.entries())
              }
            })
          )
        },
        removeItem: (name) => localStorage.removeItem(name)
      }
    }
  )
)
