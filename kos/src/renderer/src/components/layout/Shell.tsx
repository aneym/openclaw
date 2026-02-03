import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { Settings } from '../settings/Settings';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { useThreadStore } from '../../stores/thread-store';

type View = 'home' | 'settings';

export function Shell() {
  const [view, setView] = useState<View>('home');
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const activeThreadId = useThreadStore((s) => s.activeThreadId);
  const threads = useThreadStore((s) => s.threads);
  const activeThread = activeThreadId ? threads.get(activeThreadId) ?? null : null;

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-1 flex overflow-hidden">
        <Sidebar onNavigate={setView} currentView={view} />
        <main className="flex-1 bg-background overflow-hidden">
          {view === 'settings' ? (
            <Settings />
          ) : activeThread ? (
            <div className="flex-1 flex items-center justify-center h-full">
              <div className="text-center">
                <h2 className="text-2xl font-bold mb-2">{activeThread.title}</h2>
                {activeThread.subtitle && (
                  <p className="text-muted-foreground">{activeThread.subtitle}</p>
                )}
                <p className="text-sm text-muted-foreground mt-4">
                  Chat UI will be implemented in Track 4
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center h-full">
              <div className="text-center max-w-md">
                <h1 className="text-4xl font-bold mb-4">
                  Welcome to kOS
                </h1>
                <p className="text-muted-foreground mb-6">
                  {activeWorkspace?.icon || '🏠'} {activeWorkspace?.name || 'Default Workspace'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Select a thread from the sidebar or create a new one to get started.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
      <StatusBar />
    </div>
  );
}
