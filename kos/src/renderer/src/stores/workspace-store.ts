import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Workspace, WorkspaceConfig } from '../types'

interface WorkspaceState {
  config: WorkspaceConfig
  activeWorkspace: Workspace | null

  setActiveWorkspace: (id: string) => void
  addWorkspace: (ws: Workspace) => void
  updateWorkspace: (id: string, patch: Partial<Workspace>) => void
  removeWorkspace: (id: string) => void
}

const defaultConfig: WorkspaceConfig = {
  activeWorkspaceId: 'default',
  workspaces: [
    {
      id: 'default',
      name: 'Default',
      icon: '🏠',
      projects: [],
      gatewayUrl: 'ws://localhost:18789',
      createdAt: Date.now()
    }
  ]
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      config: defaultConfig,
      activeWorkspace: defaultConfig.workspaces[0],

      setActiveWorkspace: (id: string) => {
        const { config } = get()
        const workspace = config.workspaces.find((w) => w.id === id)
        if (workspace) {
          set({
            config: { ...config, activeWorkspaceId: id },
            activeWorkspace: workspace
          })
        }
      },

      addWorkspace: (ws: Workspace) => {
        const { config } = get()
        const updated = {
          ...config,
          workspaces: [...config.workspaces, ws]
        }
        set({ config: updated })
      },

      updateWorkspace: (id: string, patch: Partial<Workspace>) => {
        const { config } = get()
        const updated = {
          ...config,
          workspaces: config.workspaces.map((w) => (w.id === id ? { ...w, ...patch } : w))
        }
        const activeWorkspace = get().activeWorkspace
        set({
          config: updated,
          activeWorkspace:
            activeWorkspace?.id === id ? { ...activeWorkspace, ...patch } : activeWorkspace
        })
      },

      removeWorkspace: (id: string) => {
        const { config } = get()
        const updated = {
          ...config,
          workspaces: config.workspaces.filter((w) => w.id !== id)
        }
        // If removing active workspace, switch to first available
        if (config.activeWorkspaceId === id && updated.workspaces.length > 0) {
          updated.activeWorkspaceId = updated.workspaces[0].id
        }
        set({
          config: updated,
          activeWorkspace:
            updated.workspaces.find((w) => w.id === updated.activeWorkspaceId) || null
        })
      }
    }),
    { name: 'kos-workspaces' }
  )
)
