import { X } from "lucide-react";
import { cn } from "../../lib/utils";

interface TabItemProps {
  title: string;
  icon?: string;
  isActive: boolean;
  isPinned?: boolean;
  isStreaming?: boolean;
  onSelect: () => void;
  onClose?: () => void;
}

export function TabItem({
  title,
  icon,
  isActive,
  isPinned = false,
  isStreaming = false,
  onSelect,
  onClose,
}: TabItemProps) {
  return (
    <div
      role="tab"
      aria-selected={isActive}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "group relative flex h-9 items-center gap-2 rounded-t-md px-3 text-sm transition-all",
        "cursor-pointer select-none [-webkit-app-region:no-drag]",
        isActive
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
      )}
      title={title}
    >
      {isStreaming && <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse shrink-0" />}
      {icon && <span className="text-base leading-none shrink-0">{icon}</span>}
      <span className="truncate max-w-[160px]">{title}</span>
      {!isPinned && onClose && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className={cn(
            "ml-2 inline-flex h-5 w-5 items-center justify-center rounded-md",
            "opacity-0 group-hover:opacity-70 hover:opacity-100",
            "hover:bg-accent/60 transition-all [-webkit-app-region:no-drag]",
          )}
          aria-label={`Close ${title}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
