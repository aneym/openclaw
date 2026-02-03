import { MessageSquare, Settings } from 'lucide-react'
import { ThreadList } from '../threads/ThreadList'
import { NewThreadButton } from './NewThreadButton'

type View = 'home' | 'settings'

interface SidebarProps {
  onNavigate: (view: View) => void
  currentView: View
}

export function Sidebar({ onNavigate, currentView }: SidebarProps) {

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

      <div className="p-2">
        <NewThreadButton />
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <ThreadList onThreadClick={() => onNavigate('home')} />
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
