import { CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useChatStore } from "../../stores/chat-store";
import { useTriageStore } from "../../stores/triage-store";
import { ChatPanel } from "../panels/ChatPanel";
import { Button } from "../ui/button";

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  if (hours < 24) {
    return `${hours}h ago`;
  }
  if (days < 7) {
    return `${days}d ago`;
  }
  return new Date(timestamp).toLocaleDateString();
}

export function FocusedCatchup({
  onOpenChat,
  onOpenTerminal,
}: {
  onOpenChat: (chatId: string) => void;
  onOpenTerminal: (terminalId: string) => void;
}) {
  const events = useTriageStore((s) => s.events);
  const pending = useMemo(
    () =>
      events
        .filter((e) => e.state === "pending")
        .slice()
        .sort((a, b) => a.occurredAt - b.occurredAt),
    [events],
  );

  const cursor = useTriageStore((s) => s.cursor);
  const autoAdvance = useTriageStore((s) => s.autoAdvance);
  const toggleAutoAdvance = useTriageStore((s) => s.toggleAutoAdvance);
  const next = useTriageStore((s) => s.next);
  const prev = useTriageStore((s) => s.prev);
  const markHandled = useTriageStore((s) => s.markHandled);
  const markSkipped = useTriageStore((s) => s.markSkipped);
  const enqueue = useTriageStore((s) => s.enqueue);

  const chatsMap = useChatStore((s) => s.chats);
  const markRead = useChatStore((s) => s.markRead);

  const currentIndex = pending.length === 0 ? 0 : Math.min(cursor, pending.length - 1);
  const event = pending[currentIndex] ?? null;

  // Seed queue from persisted unread chats (e.g. after restart).
  useEffect(() => {
    for (const chat of chatsMap.values()) {
      if (!chat.hasUnread) {
        continue;
      }
      if (chat.isCron) {
        continue;
      }
      enqueue({
        source: "gateway",
        chatId: chat.id,
        sessionKey: chat.sessionKey,
        title: chat.title,
        occurredAt: chat.lastMessageAt,
      });
    }
  }, [chatsMap, enqueue]);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const focusComposer = useCallback(() => {
    const textarea = chatContainerRef.current?.querySelector("textarea");
    textarea?.focus();
  }, []);

  const handleOpen = useCallback(() => {
    if (!event) {
      return;
    }
    if (event.source === "gateway" && event.chatId) {
      onOpenChat(event.chatId);
    }
    if (event.source !== "gateway" && event.terminalId) {
      onOpenTerminal(event.terminalId);
    }
  }, [event, onOpenChat, onOpenTerminal]);

  const handleHandled = useCallback(() => {
    if (!event) {
      return;
    }
    if (event.source === "gateway" && event.chatId) {
      markRead(event.chatId);
    }
    markHandled(event.id);
  }, [event, markHandled, markRead]);

  const handleSkipped = useCallback(() => {
    if (!event) {
      return;
    }
    if (event.source === "gateway" && event.chatId) {
      markRead(event.chatId);
    }
    markSkipped(event.id);
  }, [event, markRead, markSkipped]);

  useEffect(() => {
    if (!event) {
      return;
    }

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      switch (e.key) {
        case "j":
        case "ArrowDown":
        case "ArrowRight":
          e.preventDefault();
          next();
          break;
        case "k":
        case "ArrowUp":
        case "ArrowLeft":
        case "p":
          e.preventDefault();
          prev();
          break;
        case "n":
          e.preventDefault();
          handleHandled();
          break;
        case "s":
        case "Backspace":
          e.preventDefault();
          handleSkipped();
          break;
        case "a":
          e.preventDefault();
          toggleAutoAdvance();
          break;
        case "Enter":
        case "r":
          e.preventDefault();
          if (event.source === "gateway") {
            focusComposer();
            break;
          }
          if (event.terminalId) {
            onOpenTerminal(event.terminalId);
          }
          break;
        case "o":
          e.preventDefault();
          handleOpen();
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    event,
    focusComposer,
    handleHandled,
    handleOpen,
    handleSkipped,
    next,
    onOpenTerminal,
    prev,
    toggleAutoAdvance,
  ]);

  if (!event) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <CheckCircle2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <h2 className="text-lg font-medium mb-1">All caught up</h2>
          <p className="text-sm text-muted-foreground">No completions in the catch-up queue</p>
        </div>
      </div>
    );
  }

  const showChat = event.source === "gateway" && Boolean(event.chatId);

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-lg font-semibold">Catch Up</h1>
          <span className="text-sm text-muted-foreground shrink-0">
            {currentIndex + 1} of {pending.length}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">
            {formatRelativeTime(event.occurredAt)}
          </span>
          <span className="text-sm text-muted-foreground truncate">{event.title}</span>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={handleOpen} title="Open (o)">
            Open
          </Button>
          <Button size="sm" variant="ghost" onClick={handleSkipped} title="Skip (s)">
            Skip
          </Button>
          <Button size="sm" onClick={handleHandled} title="Handled (n)">
            Handled
          </Button>
          <Button
            size="sm"
            variant={autoAdvance ? "default" : "ghost"}
            onClick={toggleAutoAdvance}
            title="Toggle auto-advance mode (a)"
          >
            Auto
          </Button>
          <Button size="icon" variant="ghost" onClick={prev} title="Previous (p/k)">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={next} title="Next (ArrowRight)">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {showChat && event.chatId ? (
          <div ref={chatContainerRef} className="h-full">
            <ChatPanel chatId={event.chatId} panelId={`triage:${event.chatId}`} autoFocus={false} />
          </div>
        ) : (
          <div className="h-full overflow-y-auto px-6 py-5 space-y-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                {event.preview || "Completion received."}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
              Use <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono">o</kbd> to open it.
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 px-6 py-3 border-t border-border">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono">n</kbd> handled
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono">s</kbd> skip
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono">j/k</kbd> nav
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono">r</kbd> reply
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono">o</kbd> open
          </span>
        </div>
      </div>
    </div>
  );
}
