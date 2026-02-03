import { useThreadStore } from '../../stores/thread-store'
import { useMessages } from '../chat/hooks/useMessages'
import { useStreaming } from '../../hooks/use-streaming'
import { MessageList } from '../chat/MessageList'
import { ComposeBar } from '../chat/ComposeBar'

interface ChatPanelProps {
  threadId: string
}

export function ChatPanel({ threadId }: ChatPanelProps) {
  // Get the thread to access sessionKey
  const thread = useThreadStore((s) => s.getThread(threadId))

  // If thread doesn't exist or has no sessionKey, show error state
  if (!thread?.sessionKey) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
        <p className="text-sm">Thread not found or session key missing</p>
        <p className="text-xs mt-2 text-muted-foreground/60">Thread ID: {threadId}</p>
      </div>
    )
  }

  const sessionKey = thread.sessionKey

  // Fetch messages and track streaming state
  const { messages, loading, error } = useMessages(sessionKey, threadId)
  const { isStreaming } = useStreaming(sessionKey)

  // Show loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
        <p className="text-sm">Loading messages...</p>
      </div>
    )
  }

  // Show error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background text-destructive">
        <p className="text-sm">Failed to load messages</p>
        <p className="text-xs mt-2 text-muted-foreground">{error}</p>
      </div>
    )
  }

  // Render chat UI
  return (
    <div className="flex flex-col h-full">
      {/* Message list (flex-1 takes remaining space) */}
      <MessageList messages={messages} isStreaming={isStreaming} />

      {/* Compose bar (fixed at bottom) */}
      <ComposeBar sessionKey={sessionKey} disabled={isStreaming} />
    </div>
  )
}
