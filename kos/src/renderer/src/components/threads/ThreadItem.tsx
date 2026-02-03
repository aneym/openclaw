import type { Thread } from "../../types";
import { useSession } from "../../gateway/hooks";
import { formatRelativeTime } from "../../lib/time-utils";

interface ThreadItemProps {
  thread: Thread;
  isActive: boolean;
  onClick: () => void;
}

export function ThreadItem({ thread, isActive, onClick }: ThreadItemProps) {
  const { isStreaming } = useSession(thread.sessionKey);

  // Determine status for the dot
  const status = isStreaming ? "streaming" : thread.status === "active" ? "idle" : "idle";

  // Status dot color
  const statusDotColor =
    status === "streaming"
      ? "bg-blue-500"
      : status === "idle"
        ? "bg-muted-foreground/30"
        : "bg-muted-foreground/30";

  // Relative timestamp
  const relativeTime = formatRelativeTime(thread.lastMessageAt);

  return (
    <button
      onClick={onClick}
      className={`w-full px-3 py-2 rounded-lg text-left transition-all duration-200 group ${
        isActive
          ? "bg-accent text-accent-foreground shadow-sm"
          : "hover:bg-accent/50 text-muted-foreground hover:text-foreground"
      }`}
    >
      <div className="flex items-start gap-2.5">
        {/* Status dot */}
        <div className="mt-1.5 shrink-0">
          <div
            className={`h-2 w-2 rounded-full transition-all duration-200 ${statusDotColor} ${
              status === "streaming" ? "animate-pulse" : ""
            }`}
          />
        </div>

        {/* Thread content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <div className="font-medium truncate text-sm">{thread.title}</div>
            <div
              className={`text-xs shrink-0 transition-opacity duration-200 ${
                isActive ? "opacity-60" : "opacity-50 group-hover:opacity-70"
              }`}
            >
              {relativeTime}
            </div>
          </div>
          {thread.subtitle && (
            <div
              className={`text-xs truncate mt-0.5 transition-opacity duration-200 ${
                isActive ? "opacity-60" : "opacity-50 group-hover:opacity-70"
              }`}
            >
              {thread.subtitle}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
