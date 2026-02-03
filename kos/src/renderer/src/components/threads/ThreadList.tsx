import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import type { Thread } from "../../types";
import { useThreadStore } from "../../stores/thread-store";
import { ThreadItem } from "./ThreadItem";

interface GroupedThreads {
  projectId: string | null;
  projectName: string;
  threads: Thread[];
}

interface ThreadListProps {
  projectId?: string | null; // Filter to specific project (null = unsorted only)
  onThreadClick?: () => void;
  compact?: boolean; // If true, don't show project headers
}

export function ThreadList({ projectId, onThreadClick, compact = false }: ThreadListProps) {
  const threads = useThreadStore((s) => s.threads);
  const activeThreadId = useThreadStore((s) => s.activeThreadId);
  const setActiveThread = useThreadStore((s) => s.setActiveThread);

  // Track which project sections are collapsed
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());

  // Group threads by project, sorted by lastMessageAt within each group
  const groupedThreads = useMemo(() => {
    const activeThreads = Array.from(threads.values()).filter((t) => t.status !== "archived");

    // If projectId filter is provided, only show threads from that project
    const filteredThreads =
      projectId !== undefined
        ? activeThreads.filter((t) => t.projectId === projectId)
        : activeThreads;

    // If compact mode, just return threads sorted
    if (compact) {
      const sorted = [...filteredThreads].sort((a, b) => b.lastMessageAt - a.lastMessageAt);
      return [
        {
          projectId: projectId ?? null,
          projectName: projectId || "Unsorted",
          threads: sorted,
        },
      ];
    }

    // Group by projectId
    const groups = new Map<string | null, Thread[]>();

    filteredThreads.forEach((thread) => {
      const key = thread.projectId || null;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(thread);
    });

    // Sort threads within each group by lastMessageAt descending
    groups.forEach((threadList) => {
      threadList.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
    });

    // Convert to array and create project names
    const result: GroupedThreads[] = [];

    // Add all projects with threads
    groups.forEach((threadList, projectId) => {
      result.push({
        projectId,
        projectName: projectId || "Unsorted",
        threads: threadList,
      });
    });

    // Sort groups: projects with threads first (sorted alphabetically), then Unsorted
    result.sort((a, b) => {
      if (a.projectId === null) return 1;
      if (b.projectId === null) return -1;
      return a.projectName.localeCompare(b.projectName);
    });

    return result;
  }, [threads, projectId, compact]);

  const toggleProject = (projectId: string | null) => {
    const key = projectId || "unsorted";
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const isProjectCollapsed = (projectId: string | null) => {
    const key = projectId || "unsorted";
    return collapsedProjects.has(key);
  };

  if (groupedThreads.length === 0) {
    return <div className="px-4 pb-4 text-sm text-muted-foreground">No active threads</div>;
  }

  // In compact mode, just show thread items without headers
  if (compact) {
    const group = groupedThreads[0];
    if (!group || group.threads.length === 0) {
      return null;
    }

    return (
      <div className="space-y-0.5">
        {group.threads.map((thread) => (
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
    <div className="space-y-0.5">
      {groupedThreads.map((group) => {
        const collapsed = isProjectCollapsed(group.projectId);
        const projectKey = group.projectId || "unsorted";

        return (
          <div key={projectKey} className="space-y-0.5">
            {/* Project header */}
            <button
              onClick={() => toggleProject(group.projectId)}
              className="w-full px-3 py-2 rounded-lg flex items-center gap-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-all duration-200"
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4 shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0" />
              )}
              <span className="truncate">{group.projectName}</span>
              <span className="ml-auto text-xs opacity-60">{group.threads.length}</span>
            </button>

            {/* Thread list (collapsed if needed) */}
            {!collapsed && (
              <div className="space-y-0.5 animate-in fade-in slide-in-from-top-1 duration-200">
                {group.threads.map((thread) => (
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
            )}
          </div>
        );
      })}
    </div>
  );
}
