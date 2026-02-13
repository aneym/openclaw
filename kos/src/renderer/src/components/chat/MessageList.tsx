import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { ActiveTool } from "@/stores/chat-session-store";
import { Button } from "@/components/ui/button";
import { klog } from "@/lib/klog";
import { cn } from "@/lib/utils";
import { peekChatSessionStore } from "@/stores/chat-session-store";
import { ChatMessage } from "@/types/message";
import { ExecutingToolsSummary } from "./ExecutingTools";
import { MessageGroup } from "./MessageGroup";
import { StreamingIndicator } from "./StreamingIndicator";
import { TextPart } from "./TextPart";

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming?: boolean;
  streamText?: string;
  streamReasoning?: string;
  activeTools?: ActiveTool[];
  awaitingResponse?: boolean;
  className?: string;
  panelId?: string;
  chatId?: string;
  thinkingVisible?: boolean;
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

export function MessageList({
  messages,
  isStreaming,
  streamText,
  streamReasoning,
  activeTools = [],
  awaitingResponse = false,
  className,
  panelId,
  chatId,
  thinkingVisible = false,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  // Scroll throttling refs for streaming autoscroll
  const scrollThrottleRef = useRef<number | null>(null);
  const userScrolledAwayRef = useRef(false);
  const lastUserInteractAtRef = useRef<number>(0);

  // Track last message identity, not just length (history can be capped at 200 and stay constant).
  const prevLastMessageSigRef = useRef<string>("");
  const lastMessageSig = useMemo(() => {
    const last = messages.length > 0 ? messages[messages.length - 1] : null;
    return last ? `${last.id}:${last.createdAt ?? ""}` : "";
  }, [messages]);

  const markUserInteracting = useCallback(() => {
    lastUserInteractAtRef.current = Date.now();
  }, []);

  const userIsInteracting = useCallback(() => {
    return Date.now() - lastUserInteractAtRef.current < 900;
  }, []);

  // Report scroll state to the chat-session-store (for cross-pane awareness)
  const storeRef = useRef<NonNullable<ReturnType<typeof peekChatSessionStore>> | null>(null);
  useEffect(() => {
    if (!panelId || !chatId) {
      return;
    }
    // Look up the store (don't create one — it should already exist from ChatPanel)
    const store = peekChatSessionStore(chatId);
    if (!store) {
      return;
    }
    storeRef.current = store;
    return () => {
      store.getState().clearPaneScroll(panelId);
      storeRef.current = null;
    };
  }, [panelId, chatId]);

  // Group consecutive same-role messages
  const messageGroups = useMemo(() => {
    const groups = groupConsecutiveMessages(messages);
    klog.messages("MessageList grouping", {
      messageCount: messages.length,
      groupCount: groups.length,
      groups: groups.map((g) => ({
        role: g.role,
        count: g.messages.length,
        ids: g.messages.map((m) => m.id),
      })),
      isStreaming,
      hasStreamText: !!streamText,
    });
    return groups;
  }, [messages]);

  // Scroll to bottom instantly on initial mount
  useEffect(() => {
    sentinelRef.current?.scrollIntoView({ behavior: "instant", block: "end" });
  }, []);

  // Track user scroll intent — pause autoscroll when user scrolls up
  const handleScroll = useCallback(() => {
    markUserInteracting();
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;

    const nearBottom = distanceFromBottom < 50;
    const scrolledAway = distanceFromBottom > 200;

    // If user scrolled more than 200px from bottom, pause autoscroll
    if (scrolledAway) {
      userScrolledAwayRef.current = true;
    } else if (nearBottom) {
      userScrolledAwayRef.current = false;
    }

    // Report to store for cross-pane awareness
    if (panelId && storeRef.current) {
      storeRef.current.getState().updatePaneScroll(panelId, {
        userNearBottom: nearBottom,
        userScrolledAway: scrolledAway,
      });
    }
  }, [markUserInteracting, panelId]);

  // Track when we're at the bottom using IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsAtBottom(entry.isIntersecting);

        // Clear "new messages" badge when we reach the bottom
        if (entry.isIntersecting) {
          setHasNewMessages(false);
          userScrolledAwayRef.current = false;
          if (panelId && storeRef.current) {
            storeRef.current.getState().updatePaneScroll(panelId, {
              newMessagesBelow: false,
              userScrolledAway: false,
              userNearBottom: true,
            });
          }
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

  // Auto-scroll when new messages arrive (compare last message identity, not count).
  useEffect(() => {
    const prev = prevLastMessageSigRef.current;
    prevLastMessageSigRef.current = lastMessageSig;

    // No messages or no identity change.
    if (!lastMessageSig || lastMessageSig === prev) {
      return;
    }

    // If the user is actively scrolling/reading, don't fight them.
    if (userIsInteracting()) {
      setHasNewMessages(true);
      if (panelId && storeRef.current) {
        storeRef.current.getState().updatePaneScroll(panelId, { newMessagesBelow: true });
      }
      return;
    }

    // Follow new messages without requiring a manual "New messages" click.
    setHasNewMessages(false);
    sentinelRef.current?.scrollIntoView({
      behavior: isAtBottom ? "instant" : "smooth",
      block: "end",
    });
  }, [isAtBottom, lastMessageSig, panelId, userIsInteracting]);

  // Auto-scroll during streaming with throttling.
  // Important: tool/thinking updates can change without streamText deltas, so include them too.
  useEffect(() => {
    if (!isStreaming) {
      return;
    }
    if (userIsInteracting()) {
      return;
    }

    // Throttle: only scroll once per 120ms frame
    if (scrollThrottleRef.current) {
      return;
    }

    scrollThrottleRef.current = requestAnimationFrame(() => {
      sentinelRef.current?.scrollIntoView({ behavior: "instant", block: "end" });
      setTimeout(() => {
        scrollThrottleRef.current = null;
      }, 120);
    });
  }, [isStreaming, streamText, streamReasoning, activeTools.length, userIsInteracting]); // deps trigger re-evaluation; throttle ref rate-limits

  // Scroll to bottom handler
  const scrollToBottom = useCallback(() => {
    sentinelRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  return (
    <div className="relative flex flex-col flex-1 min-h-0">
      {/* Scrollable message container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        onWheel={markUserInteracting}
        onTouchMove={markUserInteracting}
        onPointerDown={markUserInteracting}
        className={cn("flex-1 overflow-y-auto overflow-x-hidden", "px-4 py-4", className)}
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
      >
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No messages yet. Start a conversation!
          </div>
        ) : (
          <div className="space-y-4 max-w-3xl mx-auto w-full">
            {messageGroups.map((group, idx) => {
              const isLastGroup = idx === messageGroups.length - 1;
              // Show streaming/bridge text on last assistant group when:
              // - actively streaming (runId non-null), OR
              // - streamText is non-empty (bridge text between final and history load)
              const hasStreamContent = !!(streamText || streamReasoning);
              const shouldShowStream =
                isLastGroup && (isStreaming || hasStreamContent) && group.role === "assistant";
              // Show timestamp only at turn boundaries (last group before role change or end)
              const nextGroup = messageGroups[idx + 1];
              const isEndOfTurn = !nextGroup || nextGroup.role !== group.role;

              return (
                <MessageGroup
                  key={`group-${idx}-${group.messages[0].id}`}
                  messages={group.messages}
                  role={group.role}
                  isStreaming={shouldShowStream ? isStreaming : false}
                  streamText={shouldShowStream ? streamText : undefined}
                  streamReasoning={shouldShowStream ? streamReasoning : undefined}
                  activeTools={shouldShowStream && isStreaming ? activeTools : undefined}
                  showTimestamp={isEndOfTurn}
                  thinkingVisible={thinkingVisible}
                />
              );
            })}

            {/* Show streaming/bridge text when last group isn't assistant */}
            {!!streamText &&
              messageGroups.length > 0 &&
              messageGroups[messageGroups.length - 1].role !== "assistant" && (
                <div className="flex flex-col gap-2 items-start">
                  {activeTools.length > 0 && <ExecutingToolsSummary tools={activeTools} />}
                  <div className="max-w-[85%] text-foreground">
                    <TextPart text={streamText} isStreaming={!!isStreaming} />
                  </div>
                </div>
              )}
          </div>
        )}

        {/* Typing indicator — visible throughout entire response lifecycle */}
        {(isStreaming || awaitingResponse) && (
          <div className="max-w-3xl mx-auto w-full py-2">
            <StreamingIndicator className="opacity-60" />
          </div>
        )}

        {/* Bottom spacer — breathing room above compose bar (like standard chat apps) */}
        <div className="h-24" />
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
            aria-label="Scroll to bottom - new messages"
          >
            <ChevronDown className="w-4 h-4" />
            New messages
          </Button>
        </div>
      )}
    </div>
  );
}
