import { useThreadStore } from '../../stores/thread-store';

export function Sidebar() {
  const threads = useThreadStore((s) => Array.from(s.threads.values()));
  const activeThreadId = useThreadStore((s) => s.activeThreadId);
  const setActiveThread = useThreadStore((s) => s.setActiveThread);

  const activeThreads = threads.filter((t) => t.status === 'active');

  return (
    <div className="w-60 border-r border-border bg-muted/30 flex flex-col">
      <div className="h-12 border-b border-border px-4 flex items-center font-semibold">
        Threads
      </div>
      <div className="flex-1 overflow-y-auto">
        {activeThreads.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            No active threads
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {activeThreads.map((thread) => (
              <button
                key={thread.id}
                onClick={() => setActiveThread(thread.id)}
                className={`w-full px-3 py-2 rounded-md text-left text-sm transition-colors ${
                  thread.id === activeThreadId
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
