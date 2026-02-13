import { Bot, Check, ChevronDown, ChevronUp, Loader2, X } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { SubagentRunInfo } from "@/stores/gateway-store";
import { cn } from "@/lib/utils";

interface SubagentBannerProps {
  runs: SubagentRunInfo[];
}

function formatElapsed(startMs: number, endMs?: number): string {
  const elapsed = Math.max(0, Math.floor(((endMs ?? Date.now()) - startMs) / 1000));
  if (elapsed < 60) {
    return `${elapsed}s`;
  }
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return `${m}m ${s}s`;
}

function truncateTask(task: string, maxLen = 60): string {
  if (task.length <= maxLen) {
    return task;
  }
  return task.slice(0, maxLen - 1) + "\u2026";
}

const SubagentRunItem = memo(function SubagentRunItem({ run }: { run: SubagentRunInfo }) {
  const [elapsed, setElapsed] = useState(() =>
    formatElapsed(run.startedAt ?? run.createdAt, run.endedAt),
  );

  const isActive = !run.endedAt;
  const isOk = run.outcome?.status === "ok";
  const isError = run.outcome?.status === "error";

  // Update elapsed time every second for active runs
  useEffect(() => {
    if (!isActive) {
      setElapsed(formatElapsed(run.startedAt ?? run.createdAt, run.endedAt));
      return;
    }
    const interval = setInterval(() => {
      setElapsed(formatElapsed(run.startedAt ?? run.createdAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [isActive, run.startedAt, run.createdAt, run.endedAt]);

  return (
    <div
      className={cn("flex items-center gap-2 px-3 py-1 text-xs", !isActive && "animate-done-flash")}
    >
      {/* Status icon */}
      {isActive ? (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-accent-foreground" />
      ) : isOk ? (
        <Check className="h-3 w-3 shrink-0 text-green-500" />
      ) : isError ? (
        <X className="h-3 w-3 shrink-0 text-destructive" />
      ) : (
        <Check className="h-3 w-3 shrink-0 text-muted-foreground" />
      )}

      {/* Task label */}
      <span className="truncate flex-1 text-muted-foreground">
        {run.label ?? truncateTask(run.task)}
      </span>

      {/* Elapsed time */}
      <span className="text-muted-foreground/60 tabular-nums shrink-0">{elapsed}</span>

      {/* Status badge for completed runs */}
      {!isActive && (
        <span
          className={cn(
            "text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0",
            isError
              ? "bg-destructive/10 text-destructive"
              : "bg-green-500/10 text-green-600 dark:text-green-400",
          )}
        >
          {isError ? "Error" : "Done"}
        </span>
      )}
    </div>
  );
});

export function SubagentBanner({ runs }: SubagentBannerProps) {
  const [collapsed, setCollapsed] = useState(false);
  const prevRunCountRef = useRef(0);

  // Auto-expand when new runs arrive
  useEffect(() => {
    if (runs.length > prevRunCountRef.current) {
      setCollapsed(false);
    }
    prevRunCountRef.current = runs.length;
  }, [runs.length]);

  const toggle = useCallback(() => setCollapsed((c) => !c), []);

  if (runs.length === 0) {
    return null;
  }

  const activeCount = runs.filter((r) => !r.endedAt).length;
  const hasActive = activeCount > 0;

  const summary = hasActive
    ? `${activeCount} sub-agent${activeCount !== 1 ? "s" : ""} running`
    : `${runs.length} sub-agent run${runs.length !== 1 ? "s" : ""}`;

  return (
    <div
      className={cn(
        "shrink-0 border-b border-border/50 bg-muted/30 transition-colors",
        hasActive && "animate-pulse [animation-duration:3s]",
      )}
    >
      {/* Header */}
      <button
        onClick={toggle}
        className="flex items-center gap-2 w-full px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Bot className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 text-left">{summary}</span>
        {collapsed ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5 shrink-0" />
        )}
      </button>

      {/* Run list */}
      {!collapsed && (
        <div className="divide-y divide-border/30">
          {runs.map((run) => (
            <SubagentRunItem key={run.runId} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}
