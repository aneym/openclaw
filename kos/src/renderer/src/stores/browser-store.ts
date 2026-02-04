import { create } from 'zustand'

export interface BrowserTab {
  id: string
  url: string
  title: string
  active: boolean
}

interface BrowserState {
  // All tabs
  tabs: BrowserTab[]
  // Active tab ID
  activeTabId: string | null
  // CDP WebSocket URL for the active tab
  cdpUrl: string | null
  // Whether a browser panel is currently mounted
  isActive: boolean

  // Actions
  setTabs: (tabs: BrowserTab[]) => void
  setActiveTabId: (id: string | null) => void
  setCdpUrl: (url: string | null) => void
  setActive: (active: boolean) => void
}

export const useBrowserStore = create<BrowserState>((set) => ({
  tabs: [],
  activeTabId: null,
  cdpUrl: null,
  isActive: false,

  setTabs: (tabs) => set({ tabs }),
  setActiveTabId: (id) => set({ activeTabId: id }),
  setCdpUrl: (url) => set({ cdpUrl: url }),
  setActive: (active) => set({ isActive: active, cdpUrl: active ? undefined : null }),
}))
