import { memo, useCallback } from "react";
import type { Chat } from "../../types";
import { ChannelIcon } from "../../lib/channel-icons";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";

interface TriageCardProps {
  chat: Chat;
  isCurrent: boolean;
  preview?: string;
  onOpen: (chatId: string) => void;
  onDismiss: (chatId: string) => void;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export const TriageCard = memo(function TriageCard({
  chat,
  isCurrent,
  preview,
  onOpen,
  onDismiss,
}: TriageCardProps) {
  const handleOpen = useCallback(() => onOpen(chat.id), [onOpen, chat.id]);
  const handleDismiss = useCallback(() => onDismiss(chat.id), [onDismiss, chat.id]);

  return (
    <div
      className={cn(
        "rounded-lg border p-4 transition-all",
        isCurrent
          ? "ring-2 ring-primary border-primary bg-accent/30"
          : "border-border bg-card hover:bg-accent/20",
      )}
    >
      <div className="flex items-start gap-3">
        <ChannelIcon
          channel={chat.channel}
          className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium truncate">{chat.title}</h3>
            <span className="text-xs text-muted-foreground shrink-0">
              {formatRelativeTime(chat.lastMessageAt)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1 line-clamp-3">
            {preview || "Agent completed -- click to view"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <Button size="sm" onClick={handleOpen}>
          Open
        </Button>
        <Button size="sm" variant="ghost" onClick={handleDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
});
