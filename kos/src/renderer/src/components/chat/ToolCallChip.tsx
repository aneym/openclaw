import {
  Bot,
  ChevronRight,
  FileText,
  FilePen,
  FolderSearch,
  Globe,
  Loader2,
  MessageSquare,
  Monitor,
  Pencil,
  Search,
  Terminal,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import type { ToolCallPart, ToolResultPart } from "@/types/message";
import { cn } from "@/lib/utils";

interface ToolCallChipProps {
  part: ToolCallPart | ToolResultPart;
  onClick?: () => void;
  /** If true, start expanded */
  defaultOpen?: boolean;
  /** If true, show executing state with spinner */
  isExecuting?: boolean;
}

/** Static icon map - defined outside component to avoid recreation */
const TOOL_ICONS: Record<string, LucideIcon> = {
  Read: FileText,
  Write: FilePen,
  Edit: Pencil,
  exec: Terminal,
  Bash: Terminal,
  web_search: Search,
  WebSearch: Search,
  web_fetch: Globe,
  WebFetch: Globe,
  browser: Monitor,
  message: MessageSquare,
  Task: Bot,
  Glob: FolderSearch,
  Grep: FolderSearch,
};

/** Renders the appropriate icon for a tool */
function ToolIcon({ name, className }: { name: string; className?: string }) {
  const Icon = TOOL_ICONS[name] || Wrench;
  return <Icon className={className} />;
}

/**
 * Extract display details from tool args/result.
 */
function getToolDetails(part: ToolCallPart | ToolResultPart): string | null {
  const { toolName } = part;

  // File tools: extract file_path from args
  if (["Read", "Write", "Edit"].includes(toolName) && part.type === "tool-call") {
    const filePath = part.args.file_path as string | undefined;
    if (filePath) {
      if (filePath.length > 40) {
        const filename = filePath.split("/").pop() || filePath;
        return `.../${filename}`;
      }
      return filePath;
    }
  }

  // exec/Bash: show command (truncated)
  if ((toolName === "exec" || toolName === "Bash") && part.type === "tool-call") {
    const command = part.args.command as string | undefined;
    if (command) {
      return command.length > 40 ? command.slice(0, 37) + "..." : command;
    }
  }

  return null;
}

/**
 * Format result content for display - prettify JSON
 */
function formatResult(result: unknown): { content: string; isJson: boolean } {
  if (result === null || result === undefined) {
    return { content: "", isJson: false };
  }
  if (typeof result === "string") {
    // Try to parse as JSON for pretty printing
    try {
      const parsed = JSON.parse(result);
      return { content: JSON.stringify(parsed, null, 2), isJson: true };
    } catch {
      return { content: result, isJson: false };
    }
  }
  try {
    return { content: JSON.stringify(result, null, 2), isJson: true };
  } catch {
    return { content: String(result), isJson: false };
  }
}

export function ToolCallChip({
  part,
  onClick,
  defaultOpen = false,
  isExecuting = false,
}: ToolCallChipProps) {
  const [open, setOpen] = useState(defaultOpen);
  const details = getToolDetails(part);
  const isResult = part.type === "tool-result";
  const isError = isResult && part.isError;

  const isClickable = ["Read", "Write", "Edit"].includes(part.toolName);
  const hasContent = isResult && part.result != null;

  const handleClick = () => {
    if (hasContent) {
      setOpen(!open);
    } else if (isClickable && onClick) {
      onClick();
    }
  };

  const { content, isJson } =
    hasContent && isResult ? formatResult(part.result) : { content: "", isJson: false };

  return (
    <div className="tool-call-chip">
      <button
        onClick={handleClick}
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors",
          "border border-border/50",
          isExecuting
            ? "bg-primary/10 text-primary border-primary/30 animate-pulse"
            : isError
              ? "bg-destructive/10 text-destructive border-destructive/30"
              : isResult
                ? "bg-muted/50 text-foreground"
                : "bg-muted/30 text-muted-foreground",
          (hasContent || isClickable) && "cursor-pointer hover:bg-muted/70 hover:border-border",
          !hasContent && !isClickable && "cursor-default",
        )}
        role={isClickable || hasContent ? "button" : undefined}
        tabIndex={isClickable || hasContent ? 0 : undefined}
        onKeyDown={
          isClickable || hasContent
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleClick();
                }
              }
            : undefined
        }
        title={`Tool: ${part.toolName}${isExecuting ? " (executing)" : ""}`}
      >
        {isExecuting ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <ToolIcon name={part.toolName} className="w-3.5 h-3.5" />
        )}
        <span className="font-mono">{part.toolName}</span>
        {details && (
          <>
            <span className="text-muted-foreground/50">·</span>
            <span className="truncate max-w-[200px]">{details}</span>
          </>
        )}
        {hasContent && (
          <ChevronRight
            className={cn("w-3 h-3 transition-transform ml-0.5", open && "rotate-90")}
          />
        )}
      </button>
      {open && hasContent && content && (
        <div className="mt-1.5 rounded-md border border-border/50 bg-muted/30 overflow-hidden">
          <pre
            className={cn(
              "text-xs p-2 overflow-x-auto max-h-[300px] overflow-y-auto",
              isJson ? "text-muted-foreground" : "text-foreground whitespace-pre-wrap break-all",
            )}
          >
            <code className={isJson ? "language-json" : ""}>{content}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
