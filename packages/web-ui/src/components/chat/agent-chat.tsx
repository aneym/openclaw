import { Bot, Loader2, WifiOff, ArrowDown } from 'lucide-react'
import { useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useGateway } from '@/providers/gateway-provider'
import { useSession } from '@/providers/session-provider'
import { useGatewayChat } from '@/hooks/use-gateway-chat'
import { useScrollToBottom } from '@/hooks/use-scroll-to-bottom'
import { AgentMessage } from './agent-message'
import { AgentInput } from './agent-input'
import { Button } from '@/components/ui/button'

export function AgentChat() {
  const { connected, hello, error: gatewayError } = useGateway()
  const { sessionKey } = useSession()

  const chat = useGatewayChat({ sessionKey })
  const { containerRef, isAtBottom, scrollToBottom, autoScroll } =
    useScrollToBottom<HTMLDivElement>()

  // Auto-scroll on new messages or streaming content
  useEffect(() => {
    autoScroll()
  }, [chat.messages, chat.streamingContent, chat.toolCalls, autoScroll])

  const handleSend = useCallback(
    (text: string) => {
      chat.sendMessage(text)
    },
    [chat],
  )

  const handleAbort = useCallback(() => {
    chat.abort()
  }, [chat])

  const assistantName =
    (hello?.snapshot as Record<string, unknown> | undefined)?.assistantName as string | undefined

  const isAgentRunning = chat.runId !== null
  const lastMessage = chat.messages.length > 0 ? chat.messages[chat.messages.length - 1] : null
  const lastRole = lastMessage ? (lastMessage as Record<string, unknown>).role : null
  const showStreamingMessage = isAgentRunning && lastRole === 'user'

  return (
    <div className="flex h-dvh flex-col">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <Bot className="h-5 w-5 text-muted-foreground" />
        <span className="text-sm font-medium">
          {assistantName ?? 'OpenClaw'}
        </span>
        <div className="flex-1" />
        <ConnectionStatus connected={connected} error={gatewayError} />
      </header>

      {/* Messages */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto"
      >
        {chat.loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : chat.messages.length === 0 && !isAgentRunning ? (
          <EmptyState name={assistantName} />
        ) : (
          <div className="mx-auto max-w-3xl py-4">
            {chat.messages.map((msg, i) => (
              <AgentMessage
                key={messageKey(msg, i)}
                message={msg}
                isLast={i === chat.messages.length - 1 && !isAgentRunning}
              />
            ))}

            {/* Synthetic streaming assistant message */}
            {showStreamingMessage && (
              <AgentMessage
                message={{
                  id: 'streaming',
                  role: 'assistant',
                  content: [],
                  timestamp: Date.now(),
                }}
                isStreaming={true}
                streamingContent={chat.streamingContent ?? undefined}
                activeToolCalls={chat.toolCalls}
              />
            )}
          </div>
        )}

        {/* Scroll to bottom button */}
        {!isAtBottom && (
          <div className="sticky bottom-4 flex justify-center">
            <Button
              variant="secondary"
              size="icon"
              className="h-8 w-8 rounded-full shadow-md"
              onClick={scrollToBottom}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Error banner */}
      {chat.error && (
        <div className="border-t border-destructive/30 bg-destructive/5 px-4 py-2 text-center text-xs text-destructive">
          {chat.error}
        </div>
      )}

      {/* Input */}
      <AgentInput
        onSend={handleSend}
        onAbort={handleAbort}
        isStreaming={isAgentRunning}
        disabled={!connected}
      />
    </div>
  )
}

function ConnectionStatus({
  connected,
  error,
}: {
  connected: boolean
  error: string | null
}) {
  if (error) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-destructive">
        <WifiOff className="h-3.5 w-3.5" />
        <span>Error</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <div
        className={cn(
          'h-2 w-2 rounded-full',
          connected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse',
        )}
      />
      <span>{connected ? 'Connected' : 'Connecting...'}</span>
    </div>
  )
}

function EmptyState({ name }: { name?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <Bot className="h-7 w-7 text-muted-foreground" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">{name ?? 'OpenClaw'}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Send a message to start a conversation.
        </p>
      </div>
    </div>
  )
}

function messageKey(msg: unknown, index: number): string {
  const m = msg as Record<string, unknown>
  if (typeof m.id === 'string') return m.id
  if (typeof m.timestamp === 'number') return `${m.timestamp}-${index}`
  return `msg-${index}`
}
