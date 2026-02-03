/**
 * MessageQueue component — shows queued messages when agent is streaming.
 * Displays above the compose bar.
 */

import { X } from "lucide-react";
import { useMemo } from "react";
import { cn } from "../../lib/utils";
import { useMessageQueueStore } from "../../stores/message-queue-store";

interface MessageQueueProps {
  chatId: string;
  onSendNow: () => void;
}

// Empty array constant to avoid creating new arrays on each render
const EMPTY_QUEUE: never[] = [];

export function MessageQueue({ chatId, onSendNow }: MessageQueueProps) {
  const queuesMap = useMessageQueueStore((state) => state.queues);
  const removeFromQueue = useMessageQueueStore((state) => state.removeFromQueue);
  const clearQueue = useMessageQueueStore((state) => state.clearQueue);

  // Memoize to avoid infinite loop from new array reference
  const queue = useMemo(() => queuesMap.get(chatId) ?? EMPTY_QUEUE, [queuesMap, chatId]);

  if (queue.length === 0) {
    return null;
  }

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const truncateText = (text: string, maxLength = 60) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
  };

  return (
    <div className="border-t border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium text-muted-foreground">
          Queued messages ({queue.length})
        </div>
        <div className="flex gap-2">
          <button
            onClick={onSendNow}
            className={cn(
              "text-xs px-2 py-1 rounded bg-primary text-primary-foreground",
              "hover:bg-primary/90 transition-colors",
            )}
          >
            Send Now
          </button>
          <button
            onClick={() => clearQueue(chatId)}
            className={cn(
              "text-xs px-2 py-1 rounded bg-muted text-muted-foreground",
              "hover:bg-muted/80 transition-colors",
            )}
          >
            Clear All
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        {queue.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex items-center justify-between gap-2",
              "rounded-md bg-background border border-border p-2",
              "hover:border-muted-foreground/20 transition-colors",
            )}
          >
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <span className="text-sm text-foreground truncate">{truncateText(msg.text)}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                · {formatTimestamp(msg.timestamp)}
              </span>
            </div>
            <button
              onClick={() => removeFromQueue(chatId, msg.id)}
              className={cn(
                "shrink-0 p-0.5 rounded hover:bg-muted transition-colors",
                "text-muted-foreground hover:text-foreground",
              )}
              title="Remove"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
