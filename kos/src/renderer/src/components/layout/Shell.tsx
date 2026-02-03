import { useState, useMemo } from 'react'
import { Sidebar } from './Sidebar'
import { StatusBar } from './StatusBar'
import { Settings } from '../settings/Settings'
import { PanelContainer } from '../panels/PanelContainer'
import { ThreadSearch } from './ThreadSearch'
import { LinearBoard } from '../linear/LinearBoard'
import { useWorkspaceStore } from '../../stores/workspace-store'
import { useThreadStore } from '../../stores/thread-store'
import { useProjectStore } from '../../stores/project-store'
import { usePanelStore } from '../../stores/panel-store'
import { useGatewayStore } from '../../stores/gateway-store'
import { useKeyboardShortcuts } from '../../hooks/use-keyboard-shortcuts'

type View = 'home' | 'settings'

export function Shell() {
  const [view, setView] = useState<View>('home')
  const [searchOpen, setSearchOpen] = useState(false)
  const [sidebarVisible, setSidebarVisible] = useState(true)

  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace)
  const activeThreadId = useThreadStore((s) => s.activeThreadId)
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId)
  const selectedProject = useProjectStore((s) =>
    s.selectedProjectId ? s.getProject(s.selectedProjectId) : undefined
  )

  const request = useGatewayStore((s) => s.request)
  const connected = useGatewayStore((s) => s.connected)
  const addThread = useThreadStore((s) => s.addThread)
  const setActiveThread = useThreadStore((s) => s.setActiveThread)
  const activeLayout = usePanelStore((s) => activeThreadId ? s.getLayout(activeThreadId) : undefined)
  const splitPanel = usePanelStore((s) => s.splitPanel)
  const closePanel = usePanelStore((s) => s.closePanel)
  const resetLayout = usePanelStore((s) => s.resetLayout)

  // Helper to find the currently focused panel ID
  const findFocusedPanelId = (): string | null => {
    if (!activeLayout) return null

    // For now, return the first leaf panel
    // TODO: track actual focus state in panel store
    const findFirstLeaf = (node: typeof activeLayout.root): string | null => {
      if (node.type === 'leaf') return node.panelId
      if (node.type === 'branch') {
        return findFirstLeaf(node.children[0]) || findFirstLeaf(node.children[1])
      }
      return null
    }

    return findFirstLeaf(activeLayout.root)
  }

  // Helper to create a new thread
  const handleNewThread = async () => {
    if (!connected) return

    const threadId = 'thread-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9)
    const sessionKey = 'kos-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9)
    const now = Date.now()

    try {
      await request('sessions.patch', {
        key: sessionKey,
        label: null
      })

      const newThread = {
        id: threadId,
        sessionKey,
        title: 'New Chat',
        status: 'idle' as const,
        lastMessageAt: now,
        createdAt: now
      }

      addThread(newThread)
      resetLayout(threadId)
      setActiveThread(threadId)
      setView('home')
    } catch (err) {
      console.error('[Shell] Failed to create thread:', err)
    }
  }

  // Keyboard shortcuts
  const shortcuts = useMemo(() => [
    {
      key: '\\',
      metaKey: true,
      handler: () => setSidebarVisible((v) => !v),
      description: 'Toggle sidebar'
    },
    {
      key: 'k',
      metaKey: true,
      handler: () => setSearchOpen(true),
      description: 'Open thread search'
    },
    {
      key: 'n',
      metaKey: true,
      handler: () => void handleNewThread(),
      description: 'Create new thread'
    },
    {
      key: 'w',
      metaKey: true,
      handler: () => {
        if (!activeThreadId) return
        const panelId = findFocusedPanelId()
        if (panelId) {
          closePanel(activeThreadId, panelId)
        }
      },
      description: 'Close current panel'
    },
    {
      key: '\\',
      metaKey: true,
      shiftKey: true,
      handler: () => {
        if (!activeThreadId) return
        const panelId = findFocusedPanelId()
        if (panelId) {
          splitPanel(activeThreadId, panelId, 'horizontal', 'empty')
        }
      },
      description: 'Split panel right'
    }
  ], [activeThreadId, connected, addThread, setActiveThread, closePanel, splitPanel, activeLayout, resetLayout, request])

  useKeyboardShortcuts(shortcuts)

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-1 flex overflow-hidden">
        {sidebarVisible && <Sidebar onNavigate={setView} currentView={view} />}
        <main className="flex-1 bg-background overflow-hidden flex flex-col">
          {/* macOS titlebar drag region */}
          <div
            className="shrink-0 [-webkit-app-region:drag]"
            style={{ height: 'var(--titlebar-height)' }}
          />
          <div className="flex-1 overflow-hidden">
            {view === 'settings' ? (
              <Settings />
            ) : activeThreadId ? (
              <PanelContainer threadId={activeThreadId} />
            ) : selectedProjectId && selectedProject?.linearTeamId && activeWorkspace?.linearApiKey ? (
              <div className="h-full overflow-auto">
                <LinearBoard
                  projectId={selectedProjectId}
                  teamId={selectedProject.linearTeamId}
                  apiKey={activeWorkspace.linearApiKey}
                />
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center h-full">
                <div className="text-center max-w-md">
                  <h1 className="text-4xl font-bold mb-4">Welcome to kOS</h1>
                  <p className="text-muted-foreground mb-6">
                    {activeWorkspace?.icon || '🏠'} {activeWorkspace?.name || 'Default Workspace'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Select a thread from the sidebar or create a new one to get started.
                  </p>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
      <StatusBar />
      <ThreadSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  )
}
