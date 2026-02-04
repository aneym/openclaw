import { ChevronRight, Wrench } from "lucide-react";
import { useState, useMemo } from "react";
import type { ChatMessage, ToolCallPart, ToolResultPart } from "@/types/message";
import { staggerContainer, staggerItem } from "@/lib/animation-variants";
import { motion, AnimatePresence } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { ToolCallChip } from "./ToolCallChip";

interface ToolCallGroupProps {
  messages: ChatMessage[];
  /** Force expanded state (used during active streaming) */
  forceExpanded?: boolean;
}

/** Minimum number of tools to collapse into a group */
const COLLAPSE_THRESHOLD = 3;

/**
 * ToolCallGroup displays multiple tool calls.
 * - ≤2 tools: Show inline (no collapse)
 * - 3+ tools: Collapsed by default with "[Wrench icon] N tool calls ▸"
 * Expanded: Shows individual ToolCallChip components.
 */
export function ToolCallGroup({ messages, forceExpanded = false }: ToolCallGroupProps) {
  const [userOpen, setUserOpen] = useState(false);

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

  // Show inline for small groups (no collapse)
  const shouldCollapse = count >= COLLAPSE_THRESHOLD;
  const isOpen = forceExpanded || userOpen || !shouldCollapse;

  // For small groups, just show chips inline
  if (!shouldCollapse) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {toolParts.map((part, idx) => (
          <ToolCallChip
            key={part.type === "tool-call" || part.type === "tool-result" ? part.toolCallId : idx}
            part={part}
          />
        ))}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setUserOpen(!userOpen)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setUserOpen(!userOpen);
          }
        }}
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium",
          "border border-border/50 bg-muted/30 text-muted-foreground",
          "hover:bg-muted/50 hover:border-border transition-colors",
          "cursor-pointer",
        )}
        aria-expanded={isOpen}
        aria-label={`${count} tool calls, ${isOpen ? "collapse" : "expand"}`}
      >
        <Wrench className="w-3.5 h-3.5" />
        <span>
          {count} tool call{count !== 1 ? "s" : ""}
        </span>
        <ChevronRight className={cn("w-3 h-3 transition-transform", isOpen && "rotate-90")} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            exit="initial"
            className="flex flex-wrap gap-1.5 mt-2"
          >
            {toolParts.map((part, idx) => (
              <motion.div
                key={
                  part.type === "tool-call" || part.type === "tool-result" ? part.toolCallId : idx
                }
                variants={staggerItem}
              >
                <ToolCallChip part={part} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
