import { ChevronRight, Wrench } from "lucide-react";
import { useState, useMemo } from "react";
import type { ChatMessage, ToolCallPart, ToolResultPart } from "@/types/message";
import { cn } from "@/lib/utils";
import { ToolCallChip } from "./ToolCallChip";

interface ToolCallGroupProps {
  messages: ChatMessage[];
}

/**
 * ToolCallGroup displays multiple tool calls in a collapsed group.
 * Collapsed: "[Wrench icon] 3 tool calls ▸"
 * Expanded: Shows individual ToolCallChip components.
 */
export function ToolCallGroup({ messages }: ToolCallGroupProps) {
  const [open, setOpen] = useState(false);

  // Extract all tool-call and tool-result parts from messages
  const toolParts = useMemo(() => {
    return messages.flatMap((msg) =>
      msg.parts.filter(
        (p): p is ToolCallPart | ToolResultPart =>
          p.type === "tool-call" || p.type === "tool-result",
      ),
    );
  }, [messages]);

  const count = toolParts.length;

  if (count === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium",
          "border border-border/50 bg-muted/30 text-muted-foreground",
          "hover:bg-muted/50 hover:border-border transition-colors",
          "cursor-pointer",
        )}
      >
        <Wrench className="w-3.5 h-3.5" />
        <span>
          {count} tool call{count !== 1 ? "s" : ""}
        </span>
        <ChevronRight className={cn("w-3 h-3 transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {toolParts.map((part, idx) => (
            <ToolCallChip
              key={part.type === "tool-call" || part.type === "tool-result" ? part.toolCallId : idx}
              part={part}
            />
          ))}
        </div>
      )}
    </div>
  );
}
