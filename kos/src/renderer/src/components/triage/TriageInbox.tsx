import { CheckCircle2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Chat } from "../../types";
import { getChatSessionStore } from "../../stores/chat-session-store";
import { useChatStore } from "../../stores/chat-store";
import { Button } from "../ui/button";
import { TriageCard } from "./TriageCard";

interface TriageInboxProps {
  onOpenChat: (chatId: string) => void;
}

function getPreview(chat: Chat): string | undefined {
  try {
    const store = getChatSessionStore(chat.sessionKey, chat.id);
    const messages = store.getState().messages;
    // Walk backwards to find the last assistant message (avoids copying the array)
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== "assistant") continue;
      const textPart = msg.parts.find((p) => p.type === "text");
      if (textPart && textPart.type === "text") return textPart.text;
      return undefined;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function TriageInbox({ onOpenChat }: TriageInboxProps) {
  const chatsMap = useChatStore((s) => s.chats);
  const markRead = useChatStore((s) => s.markRead);

  const unreadChats = useMemo(() => {
    const result: Chat[] = [];
    for (const chat of chatsMap.values()) {
      if (chat.hasUnread) result.push(chat);
    }
    return result.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  }, [chatsMap]);

  // Memoize previews so getPreview doesn't run on every render
  const previews = useMemo(() => {
    const map = new Map<string, string | undefined>();
    for (const chat of unreadChats) {
      map.set(chat.id, getPreview(chat));
    }
    return map;
  }, [unreadChats]);

  const [rawIndex, setCurrentIndex] = useState(0);

  // Clamp index when list shrinks (derived, no effect needed)
  const currentIndex = unreadChats.length === 0 ? 0 : Math.min(rawIndex, unreadChats.length - 1);

  const currentChatId = unreadChats[currentIndex]?.id;

  // Auto-scroll current card into view
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  useEffect(() => {
    if (!currentChatId) return;
    const el = cardRefs.current.get(currentChatId);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentChatId]);

  const handleOpen = useCallback(
    (chatId: string) => {
      markRead(chatId);
      onOpenChat(chatId);
    },
    [markRead, onOpenChat],
  );

  const handleDismiss = useCallback(
    (chatId: string) => {
      markRead(chatId);
      // Advance to next if dismissing current
      if (unreadChats.length > 1 && currentIndex >= unreadChats.length - 1) {
        setCurrentIndex((i) => Math.max(0, i - 1));
      }
    },
    [markRead, unreadChats.length, currentIndex],
  );

  const handleDismissAll = useCallback(() => {
    for (const chat of unreadChats) {
      markRead(chat.id);
    }
  }, [unreadChats, markRead]);

  // Keyboard navigation
  useEffect(() => {
    if (unreadChats.length === 0) return;

    const handler = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          setCurrentIndex((i) => Math.min(i + 1, unreadChats.length - 1));
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          setCurrentIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter": {
          e.preventDefault();
          const chat = unreadChats[currentIndex];
          if (chat) handleOpen(chat.id);
          break;
        }
        case " ":
        case "Backspace": {
          e.preventDefault();
          const chat = unreadChats[currentIndex];
          if (chat) handleDismiss(chat.id);
          break;
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [unreadChats, currentIndex, handleOpen, handleDismiss]);

  if (unreadChats.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <CheckCircle2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <h2 className="text-lg font-medium mb-1">All caught up</h2>
          <p className="text-sm text-muted-foreground">No unread agent completions</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Triage</h1>
          <span className="text-sm text-muted-foreground">
            {currentIndex + 1} of {unreadChats.length} unread
          </span>
        </div>
        <Button size="sm" variant="ghost" onClick={handleDismissAll}>
          Dismiss All
        </Button>
      </div>

      {/* Card list */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {unreadChats.map((chat, index) => (
          <div
            key={chat.id}
            ref={(el) => {
              if (el) cardRefs.current.set(chat.id, el);
              else cardRefs.current.delete(chat.id);
            }}
          >
            <TriageCard
              chat={chat}
              isCurrent={index === currentIndex}
              preview={previews.get(chat.id)}
              onOpen={handleOpen}
              onDismiss={handleDismiss}
            />
          </div>
        ))}
      </div>

      {/* Keyboard hints */}
      <div className="shrink-0 px-6 py-3 border-t border-border">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono">j/k</kbd> navigate
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono">Enter</kbd> open
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono">Space</kbd> dismiss
          </span>
        </div>
      </div>
    </div>
  );
}
