import { useMemo } from 'react'
import { useThreadStore } from '../../stores/thread-store'
import { MessageSquare, Settings } from 'lucide-react'

type View = 'home' | 'settings'

interface SidebarProps {
  onNavigate: (view: View) => void
  currentView: View
}

export function Sidebar({ onNavigate, currentView }: SidebarProps) {
  const threads = useThreadStore((s) => s.threads)
  const activeThreadId = useThreadStore((s) => s.activeThreadId)
  const setActiveThread = useThreadStore((s) => s.setActiveThread)

  const activeThreads = useMemo(
    () => Array.from(threads.values()).filter((t) => t.status === 'active'),
    [threads]
  )

  return (
    <div className="w-60 border-r border-border bg-muted/30 flex flex-col">
      {/* Header with macOS titlebar inset — drag region for window movement */}
      <div
        className="shrink-0 border-b border-border [-webkit-app-region:drag]"
        style={{ paddingTop: 'var(--titlebar-height)' }}
      >
        <div className="h-12 px-4 flex items-center font-semibold">kOS</div>
      </div>

      {/* Nav */}
      <div className="p-2 space-y-1">
        <button
          onClick={() => onNavigate('home')}
          className={`w-full px-3 py-2 rounded-md text-left text-sm transition-colors flex items-center gap-2 ${
            currentView === 'home'
              ? 'bg-accent text-accent-foreground'
              : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          Home
        </button>
      </div>

      <div className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Threads
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeThreads.length === 0 ? (
          <div className="px-4 pb-4 text-sm text-muted-foreground">No active threads</div>
        ) : (
          <div className="p-2 space-y-1">
            {activeThreads.map((thread) => (
              <button
                key={thread.id}
                onClick={() => {
                  setActiveThread(thread.id)
                  onNavigate('home')
                }}
                className={`w-full px-3 py-2 rounded-md text-left text-sm transition-colors ${
                  thread.id === activeThreadId && currentView === 'home'
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'
                }`}
              >
                <div className="font-medium truncate">{thread.title}</div>
                {thread.subtitle && (
                  <div className="text-xs opacity-70 truncate">{thread.subtitle}</div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Bottom nav - Settings */}
      <div className="border-t border-border p-2">
        <button
          onClick={() => onNavigate('settings')}
          className={`w-full px-3 py-2 rounded-md text-left text-sm transition-colors flex items-center gap-2 ${
            currentView === 'settings'
              ? 'bg-accent text-accent-foreground'
              : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'
          }`}
        >
          <Settings className="h-4 w-4" />
          Settings
        </button>
      </div>
    </div>
  )
}
