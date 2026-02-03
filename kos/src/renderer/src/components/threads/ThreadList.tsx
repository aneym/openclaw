import { ChevronDown, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Thread } from "../../types";
import { useTabStore } from "../../stores/tab-store";
import { useThreadStore } from "../../stores/thread-store";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { ThreadItem } from "./ThreadItem";
import { ThreadListSkeleton } from "./ThreadListSkeleton";

// Display limits
const DEFAULT_VISIBLE = 10;
const ACTIVE_THRESHOLD_MS = 1_200_000; // 20 minutes
const THREAD_GROUPS_KEY = "kos-threadGroupsCollapsed";
const DEFAULT_COLLAPSED = new Set(["Older", "Automated", "Archived"]);

interface ThreadGroup {
  label: string;
  threads: Thread[];
  defaultCollapsed: boolean;
}

interface ThreadListProps {
  projectId?: string | null; // Filter to specific project (null = unsorted only)
  onThreadClick?: () => void;
  compact?: boolean; // If true, don't show group headers
}

// Persistence helpers
function loadCollapsedGroups(): Set<string> {
  try {
    const raw = localStorage.getItem(THREAD_GROUPS_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return new Set(DEFAULT_COLLAPSED);
}

function saveCollapsedGroups(groups: Set<string>) {
  localStorage.setItem(THREAD_GROUPS_KEY, JSON.stringify([...groups]));
}

// Group threads into Active, Older, Automated, Archived
function groupThreads(threads: Thread[]): ThreadGroup[] {
  const now = Date.now();
  const active: Thread[] = [];
  const older: Thread[] = [];
  const automated: Thread[] = [];
  const archived: Thread[] = [];

  for (const t of threads) {
    if (t.status === "archived") {
      archived.push(t);
    } else if (t.sessionKey?.startsWith("cron:")) {
      automated.push(t);
    } else if (now - t.lastMessageAt < ACTIVE_THRESHOLD_MS) {
      active.push(t);
    } else {
      older.push(t);
    }
  }

  // Sort each group by lastMessageAt descending
  const sortByRecent = (a: Thread, b: Thread) => b.lastMessageAt - a.lastMessageAt;
  active.sort(sortByRecent);
  older.sort(sortByRecent);
  automated.sort(sortByRecent);
  archived.sort(sortByRecent);

  return [
    { label: "Active", threads: active, defaultCollapsed: false },
    { label: "Older", threads: older, defaultCollapsed: true },
    { label: "Automated", threads: automated, defaultCollapsed: true },
    { label: "Archived", threads: archived, defaultCollapsed: true },
  ].filter((g) => g.threads.length > 0);
}

export function ThreadList({ projectId, onThreadClick, compact = false }: ThreadListProps) {
  const threads = useThreadStore((s) => s.threads);
  const activeThreadId = useThreadStore((s) => s.activeThreadId);
  const setActiveThread = useThreadStore((s) => s.setActiveThread);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const activeTabIdByWorkspace = useTabStore((s) => s.activeTabIdByWorkspace);
  const homeTabId = activeWorkspace ? `home-${activeWorkspace.id}` : null;
  const activeTabId = useMemo(() => {
    if (!activeWorkspace) return null;
    return activeTabIdByWorkspace[activeWorkspace.id] ?? homeTabId ?? null;
  }, [activeTabIdByWorkspace, activeWorkspace?.id, homeTabId]);

  // Track which groups are collapsed (persisted to localStorage)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => loadCollapsedGroups());
  // Track how many threads to show per group (for "Load more")
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});

  // Persist collapsed state changes
  useEffect(() => {
    saveCollapsedGroups(collapsedGroups);
  }, [collapsedGroups]);

  // Filter threads by tab and optionally by project
  const filteredThreads = useMemo(() => {
    let result = Array.from(threads.values()).filter((thread) => {
      if (!activeTabId) return true;
      return thread.tabId === activeTabId;
    });

    // If projectId filter is provided, only show threads from that project
    if (projectId !== undefined) {
      result = result.filter((t) =>
        projectId === null ? !t.projectId : t.projectId === projectId,
      );
    }

    return result;
  }, [threads, activeTabId, projectId]);

  // Group threads by category
  const threadGroups = useMemo(() => groupThreads(filteredThreads), [filteredThreads]);

  const toggleGroup = useCallback((label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }, []);

  const loadMore = useCallback((label: string, total: number) => {
    setVisibleCounts((prev) => ({
      ...prev,
      [label]: Math.min((prev[label] ?? DEFAULT_VISIBLE) + DEFAULT_VISIBLE, total),
    }));
  }, []);

  const getVisibleCount = (label: string) => visibleCounts[label] ?? DEFAULT_VISIBLE;

  const isLoading = useThreadStore((s) => s.isLoading);

  if (threadGroups.length === 0) {
    if (compact) {
      return null;
    }
    if (isLoading) {
      return <ThreadListSkeleton />;
    }
    return <div className="px-4 pb-4 text-sm text-muted-foreground">No threads</div>;
  }

  // In compact mode, show all threads flat without group headers
  if (compact) {
    const allThreads = threadGroups.flatMap((g) => g.threads);
    if (allThreads.length === 0) {
      return null;
    }

    return (
      <div className="space-y-0.5">
        {allThreads.slice(0, DEFAULT_VISIBLE).map((thread) => (
          <ThreadItem
            key={thread.id}
            thread={thread}
            isActive={thread.id === activeThreadId}
            onClick={() => {
              setActiveThread(thread.id);
              onThreadClick?.();
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {threadGroups.map((group) => {
        const collapsed = collapsedGroups.has(group.label);
        const visibleCount = getVisibleCount(group.label);
        const visibleThreads = group.threads.slice(0, visibleCount);
        const hasMore = group.threads.length > visibleCount;

        return (
          <div key={group.label} className="space-y-0.5">
            {/* Group header */}
            <button
              onClick={() => toggleGroup(group.label)}
              className="w-full px-3 py-2 rounded-lg flex items-center gap-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-all duration-200"
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4 shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0" />
              )}
              <span className="truncate">{group.label}</span>
              <span className="ml-auto text-xs opacity-60">{group.threads.length}</span>
            </button>

            {/* Thread list (collapsed if needed) */}
            {!collapsed && (
              <div className="space-y-0.5 animate-in fade-in slide-in-from-top-1 duration-200">
                {visibleThreads.map((thread) => (
                  <ThreadItem
                    key={thread.id}
                    thread={thread}
                    isActive={thread.id === activeThreadId}
                    onClick={() => {
                      setActiveThread(thread.id);
                      onThreadClick?.();
                    }}
                  />
                ))}

                {/* Load more button */}
                {hasMore && (
                  <button
                    onClick={() => loadMore(group.label, group.threads.length)}
                    className="w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/20 rounded transition-colors"
                  >
                    Load more ({group.threads.length - visibleCount} remaining)
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
