import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChatMessage } from "@/types/message";
import { MessageGroup } from "./MessageGroup";
import { StreamingIndicator } from "./StreamingIndicator";

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming?: boolean;
  streamText?: string;
  className?: string;
}

interface MessageGrouping {
  role: "user" | "assistant" | "system" | "tool";
  messages: ChatMessage[];
}

function normalizeRoleForGrouping(role: string): string {
  // Treat tool messages as part of assistant turns
  if (role === "tool") {
    return "assistant";
  }
  return role;
}

function groupConsecutiveMessages(messages: ChatMessage[]): MessageGrouping[] {
  const groups: MessageGrouping[] = [];
  let currentGroup: MessageGrouping | null = null;

  for (const message of messages) {
    const normalizedRole = normalizeRoleForGrouping(message.role);
    const currentNormalizedRole = currentGroup ? normalizeRoleForGrouping(currentGroup.role) : null;

    if (currentGroup && currentNormalizedRole === normalizedRole) {
      // Add to current group
      currentGroup.messages.push(message);
    } else {
      // Start new group
      currentGroup = {
        role: message.role,
        messages: [message],
      };
      groups.push(currentGroup);
    }
  }

  return groups;
}

export function MessageList({ messages, isStreaming, streamText, className }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const prevMessageCountRef = useRef(messages.length);

  // Group consecutive same-role messages
  const messageGroups = useMemo(() => groupConsecutiveMessages(messages), [messages]);

  // Scroll to bottom instantly on initial mount
  useEffect(() => {
    sentinelRef.current?.scrollIntoView({ behavior: "instant", block: "end" });
  }, []);

  // Track when we're at the bottom using IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsAtBottom(entry.isIntersecting);

        // Clear "new messages" badge when we reach the bottom
        if (entry.isIntersecting) {
          setHasNewMessages(false);
        }
      },
      {
        root: containerRef.current,
        threshold: 0.1,
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Auto-scroll when new messages arrive (if at bottom)
  useEffect(() => {
    const hasNewMessage = messages.length > prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;

    if (!hasNewMessage) return;

    if (isAtBottom) {
      // Instant scroll to bottom
      sentinelRef.current?.scrollIntoView({ behavior: "instant", block: "end" });
    } else {
      // Show "new messages" badge when scrolled up
      setHasNewMessages(true);
    }
  }, [messages.length, isAtBottom]);

  // Auto-scroll during streaming (if at bottom)
  useEffect(() => {
    if (isStreaming && isAtBottom) {
      sentinelRef.current?.scrollIntoView({ behavior: "instant", block: "end" });
    }
  }, [isStreaming, isAtBottom, streamText]);

  // Scroll to bottom handler
  const scrollToBottom = useCallback(() => {
    sentinelRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  return (
    <div className="relative flex flex-col h-full">
      {/* Scrollable message container */}
      <div
        ref={containerRef}
        className={cn("flex-1 overflow-y-auto overflow-x-hidden", "px-4 py-4", className)}
      >
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No messages yet. Start a conversation!
          </div>
        ) : (
          <div className="space-y-4">
            {messageGroups.map((group, idx) => {
              const isLastGroup = idx === messageGroups.length - 1;
              // Only show streaming indicator on assistant messages, not user messages
              const shouldShowStreaming = isLastGroup && isStreaming && group.role === "assistant";
              // Show timestamp only at turn boundaries (last group before role change or end)
              const nextGroup = messageGroups[idx + 1];
              const isEndOfTurn = !nextGroup || nextGroup.role !== group.role;

              return (
                <MessageGroup
                  key={`group-${idx}-${group.messages[0].id}`}
                  messages={group.messages}
                  role={group.role}
                  isStreaming={shouldShowStreaming}
                  streamText={shouldShowStreaming ? streamText : undefined}
                  showTimestamp={isEndOfTurn}
                />
              );
            })}

            {/* Show streaming content when assistant is responding */}
            {isStreaming &&
              messageGroups.length > 0 &&
              messageGroups[messageGroups.length - 1].role !== "assistant" && (
                <div className="flex flex-col gap-2 items-start">
                  <div className="max-w-[85%] text-foreground">
                    {streamText ? (
                      <div className="whitespace-pre-wrap">{streamText}</div>
                    ) : (
                      <StreamingIndicator className="opacity-60" />
                    )}
                  </div>
                </div>
              )}
          </div>
        )}

        {/* Sentinel element for IntersectionObserver */}
        <div ref={sentinelRef} className="h-px" />
      </div>

      {/* "New messages" badge when scrolled up */}
      {hasNewMessages && !isAtBottom && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
          <Button
            size="sm"
            variant="secondary"
            onClick={scrollToBottom}
            className="shadow-lg gap-1"
          >
            <ChevronDown className="w-4 h-4" />
            New messages
          </Button>
        </div>
      )}
    </div>
  );
}
