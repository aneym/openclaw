import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import type { Chat } from "../../types";
import { useChatSession } from "../../hooks/use-chat-session";
import { useSubagentRuns } from "../../hooks/use-subagent-sync";
import { klog } from "../../lib/klog";
import { useChatStore } from "../../stores/chat-store";
import { ComposeBar } from "../chat/ComposeBar";
import { MessageList } from "../chat/MessageList";
import { SlashAutocomplete } from "../chat/SlashAutocomplete";
import { SubagentBanner } from "../chat/SubagentBanner";

interface ChatPanelProps {
  chatId: string;
  panelId?: string;
  autoFocus?: boolean;
}

export function ChatPanel({ chatId, panelId, autoFocus = false }: ChatPanelProps) {
  // Select raw Map to avoid calling method in selector (causes infinite loops)
  const chatsMap = useChatStore((s) => s.chats);

  // Derive chat outside selector with useMemo
  const chat = useMemo(() => chatsMap.get(chatId) as Chat | undefined, [chatsMap, chatId]);

  const sessionKey = chat?.sessionKey ?? "";

  // Ref for compose area (used by SlashAutocomplete to find textarea)
  const composeRef = useRef<HTMLDivElement>(null);

  // Diagnostic logging on mount and when chat changes
  useEffect(() => {
    klog.session("ChatPanel mounted/updated", {
      chatId,
      sessionKey: sessionKey || "(none)",
      chatExists: !!chat,
      chatTitle: chat?.title,
      chatStatus: chat?.status,
    });
  }, [chatId, sessionKey, chat]);

  // Unified chat session state - single hook manages messages + streaming + queue
  const {
    messages,
    loading,
    error,
    isStreaming,
    streamText,
    streamReasoning,
    activeTools,
    awaitingResponse,
    isCompacting,
    thinkingVisible,
    queue,
    sendMessage,
    sendNow,
    abort,
    removeFromQueue,
  } = useChatSession(sessionKey, chatId);

  // Sub-agent runs for this session
  const subagentRuns = useSubagentRuns(sessionKey || undefined);

  // Toast when compaction completes
  const wasCompactingRef = useRef(false);
  useEffect(() => {
    if (wasCompactingRef.current && !isCompacting) {
      toast("Context compacted", { duration: 3000 });
    }
    wasCompactingRef.current = isCompacting;
  }, [isCompacting]);

  // Slash autocomplete: set textarea value via native input setter (React-friendly)
  const handleSlashSelect = useCallback((command: string) => {
    const textarea = composeRef.current?.querySelector("textarea");
    if (!textarea) {
      return;
    }
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    nativeInputValueSetter?.call(textarea, command);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.focus();
  }, []);

  // If chat doesn't exist or has no sessionKey, show error state
  if (!chat?.sessionKey) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
        <p className="text-sm">Chat not found or session key missing</p>
        <p className="text-xs mt-2 text-muted-foreground/60">Chat ID: {chatId}</p>
      </div>
    );
  }

  // Show loading state only on initial load (when no messages yet)
  if (loading && messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
        <p className="text-sm">Loading messages...</p>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background text-destructive">
        <p className="text-sm">Failed to load messages</p>
        <p className="text-xs mt-2 text-muted-foreground">{error}</p>
      </div>
    );
  }

  // Render chat UI
  return (
    <div className="flex flex-col h-full">
      {/* Sub-agent status banner */}
      {subagentRuns.length > 0 && <SubagentBanner runs={subagentRuns} />}

      {/* Context compaction indicator */}
      {isCompacting && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-muted/50 border-b border-border text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Compacting context...
        </div>
      )}

      {/* Message list (flex-1 takes remaining space) */}
      <MessageList
        messages={messages}
        isStreaming={isStreaming}
        streamText={streamText}
        streamReasoning={thinkingVisible ? streamReasoning : undefined}
        activeTools={activeTools}
        awaitingResponse={awaitingResponse}
        panelId={panelId}
        chatId={chatId}
        thinkingVisible={thinkingVisible}
      />

      {/* Compose area with slash autocomplete overlay */}
      <div ref={composeRef} className="relative">
        <SlashAutocomplete containerRef={composeRef} onSelect={handleSlashSelect} />
        <ComposeBar
          sessionKey={sessionKey}
          chatId={chatId}
          isStreaming={isStreaming}
          awaitingResponse={awaitingResponse}
          autoFocus={autoFocus}
          queue={queue}
          onSend={sendMessage}
          onSendNow={sendNow}
          onAbort={abort}
          onRemoveFromQueue={removeFromQueue}
        />
      </div>
    </div>
  );
}
