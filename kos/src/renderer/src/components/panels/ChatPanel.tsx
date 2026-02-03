import { useMemo } from "react";
import { useStreaming } from "../../hooks/use-streaming";
import { useThreadStore } from "../../stores/thread-store";
import { ComposeBar } from "../chat/ComposeBar";
import { useMessages } from "../chat/hooks/useMessages";
import { MessageList } from "../chat/MessageList";

interface ChatPanelProps {
  threadId: string;
}

export function ChatPanel({ threadId }: ChatPanelProps) {
  // Select raw Map to avoid calling method in selector (causes infinite loops)
  const threadsMap = useThreadStore((s) => s.threads);

  // Derive thread outside selector with useMemo
  const thread = useMemo(() => threadsMap.get(threadId), [threadsMap, threadId]);

  // If thread doesn't exist or has no sessionKey, show error state
  if (!thread?.sessionKey) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
        <p className="text-sm">Thread not found or session key missing</p>
        <p className="text-xs mt-2 text-muted-foreground/60">Thread ID: {threadId}</p>
      </div>
    );
  }

  const sessionKey = thread.sessionKey;

  // Fetch messages and track streaming state
  const { messages, loading, error } = useMessages(sessionKey, threadId);
  const { isStreaming } = useStreaming(sessionKey);

  // Show loading state
  if (loading) {
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
      <MessageList messages={messages} isStreaming={isStreaming} />

      {/* Compose bar (fixed at bottom) */}
      <ComposeBar sessionKey={sessionKey} threadId={threadId} disabled={isStreaming} />
    </div>
  );
}
