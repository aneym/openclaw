/**
 * ExecutingTools component — shows currently executing tools during streaming.
 * Displays animated chips for each active tool execution.
 */

import { Loader2, Wrench } from "lucide-react";
import type { ActiveTool } from "@/stores/chat-session-store";
import { cn } from "@/lib/utils";

interface ExecutingToolsProps {
  tools: ActiveTool[];
  className?: string;
}

export function ExecutingTools({ tools, className }: ExecutingToolsProps) {
  if (tools.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {tools.map((tool) => (
        <div
          key={tool.toolCallId}
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium",
            "border border-primary/30 bg-primary/10 text-primary",
            "animate-pulse",
          )}
          title={`Executing: ${tool.toolName}`}
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span className="font-mono">{tool.toolName}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Collapsed summary for multiple executing tools.
 */
export function ExecutingToolsSummary({ tools, className }: ExecutingToolsProps) {
  if (tools.length === 0) return null;

  if (tools.length === 1) {
    return <ExecutingTools tools={tools} className={className} />;
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium",
        "border border-primary/30 bg-primary/10 text-primary",
        "animate-pulse",
        className,
      )}
    >
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
      <Wrench className="w-3 h-3" />
      <span>{tools.length} tools executing</span>
    </div>
  );
}
