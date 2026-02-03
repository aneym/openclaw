import { useMemo } from "react";
import type { Chat } from "../../types";
import { useStreaming } from "../../hooks/use-streaming";
import { useChatStore } from "../../stores/chat-store";
import { ComposeBar } from "../chat/ComposeBar";
import { useMessages } from "../chat/hooks/useMessages";
import { MessageList } from "../chat/MessageList";

interface ChatPanelProps {
  chatId: string;
}

export function ChatPanel({ chatId }: ChatPanelProps) {
  // Select raw Map to avoid calling method in selector (causes infinite loops)
  const chatsMap = useChatStore((s) => s.chats);

  // Derive chat outside selector with useMemo
  const chat = useMemo(() => chatsMap.get(chatId) as Chat | undefined, [chatsMap, chatId]);

  const sessionKey = chat?.sessionKey ?? "";

  // Fetch messages and track streaming state (hooks must be called unconditionally)
  const { messages, loading, error, addMessage } = useMessages(sessionKey, chatId);
  const { isStreaming, streamText } = useStreaming(sessionKey);

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
      {/* Message list (flex-1 takes remaining space) */}
      <MessageList messages={messages} isStreaming={isStreaming} streamText={streamText} />

      {/* Compose bar (fixed at bottom) */}
      <ComposeBar
        sessionKey={sessionKey}
        chatId={chatId}
        disabled={isStreaming}
        onAddMessage={addMessage}
      />
    </div>
  );
}
