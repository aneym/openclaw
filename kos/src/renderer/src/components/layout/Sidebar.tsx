import { useMemo } from 'react';
import { useThreadStore } from '../../stores/thread-store';
import { Palette, MessageSquare } from 'lucide-react';

type View = 'home' | 'theme';

interface SidebarProps {
  onNavigate: (view: View) => void;
  currentView: View;
}

export function Sidebar({ onNavigate, currentView }: SidebarProps) {
  const threads = useThreadStore((s) => s.threads);
  const activeThreadId = useThreadStore((s) => s.activeThreadId);
  const setActiveThread = useThreadStore((s) => s.setActiveThread);

  const activeThreads = useMemo(
    () => Array.from(threads.values()).filter((t) => t.status === 'active'),
    [threads]
  );

  return (
    <div className="w-60 border-r border-border bg-muted/30 flex flex-col">
      <div className="h-12 border-b border-border px-4 flex items-center font-semibold">
        kOS
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
        <button
          onClick={() => onNavigate('theme')}
          className={`w-full px-3 py-2 rounded-md text-left text-sm transition-colors flex items-center gap-2 ${
            currentView === 'theme'
              ? 'bg-accent text-accent-foreground'
              : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'
          }`}
        >
          <Palette className="h-4 w-4" />
          Theme
        </button>
      </div>

      <div className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Threads
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeThreads.length === 0 ? (
          <div className="px-4 pb-4 text-sm text-muted-foreground">
            No active threads
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {activeThreads.map((thread) => (
              <button
                key={thread.id}
                onClick={() => {
                  setActiveThread(thread.id);
                  onNavigate('home');
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
    </div>
  );
}
