import { useState, useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { StatusBar } from './StatusBar'
import { Settings } from '../settings/Settings'
import { PanelContainer } from '../panels/PanelContainer'
import { ThreadSearch } from './ThreadSearch'
import { LinearBoard } from '../linear/LinearBoard'
import { useWorkspaceStore } from '../../stores/workspace-store'
import { useThreadStore } from '../../stores/thread-store'
import { useProjectStore } from '../../stores/project-store'

type View = 'home' | 'settings'

export function Shell() {
  const [view, setView] = useState<View>('home')
  const [searchOpen, setSearchOpen] = useState(false)
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace)
  const activeThreadId = useThreadStore((s) => s.activeThreadId)
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId)
  const selectedProject = useProjectStore((s) =>
    s.selectedProjectId ? s.getProject(s.selectedProjectId) : undefined
  )

  // Cmd+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-1 flex overflow-hidden">
        <Sidebar onNavigate={setView} currentView={view} />
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
