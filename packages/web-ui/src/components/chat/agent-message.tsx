import { Bot, Copy, Check, User } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { normalizeMessage, type MessageContentBlock } from '@/types/chat'
import { Response, StreamingResponse } from './response'
import { ToolCallList } from './tool-call'
import { Button } from '@/components/ui/button'
import type { ToolStreamEntry } from '@/lib/gateway/types'

interface AgentMessageProps {
  message: unknown
  isLast?: boolean
  isStreaming?: boolean
  streamingContent?: string
  activeToolCalls?: ToolStreamEntry[]
}

export function AgentMessage({
  message,
  isLast,
  isStreaming,
  streamingContent,
  activeToolCalls,
}: AgentMessageProps) {
  const normalized = normalizeMessage(message)
  const isUser = normalized.role === 'user'
  const isToolResult = normalized.role === 'toolResult'
  const textContent = extractTextContent(normalized.content)

  // For streaming messages, use streamingContent if available
  const displayContent = isStreaming ? (streamingContent ?? '') : textContent

  // Tool calls: streaming gets activeToolCalls, finalized gets nothing (tools baked into history)
  const toolCalls = isStreaming ? (activeToolCalls ?? []) : []

  if (isToolResult) return null
  // Skip non-streaming messages with no visible text (e.g. tool_use-only assistant turns)
  if (!isStreaming && !textContent) return null

  return (
    <div
      className={cn(
        'group flex gap-3 px-4 py-3',
        isUser ? 'flex-row-reverse' : 'flex-row',
      )}
    >
      <div
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground',
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      <div
        className={cn(
          'flex max-w-[80%] flex-col gap-1',
          isUser ? 'items-end' : 'items-start',
        )}
      >
        {isUser ? (
          <div className="rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-primary-foreground">
            <p className="text-sm whitespace-pre-wrap">{textContent}</p>
          </div>
        ) : (
          <div className="relative rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5 w-full">
            {/* Tool calls rendered inside the assistant message */}
            {toolCalls.length > 0 && (
              <div className="mb-2">
                <ToolCallList tools={toolCalls} />
              </div>
            )}

            {/* Text content */}
            {isStreaming ? (
              displayContent ? (
                <StreamingResponse content={displayContent} />
              ) : toolCalls.length === 0 ? (
                <span className="inline-block h-4 w-1.5 animate-pulse bg-foreground/60" />
              ) : null
            ) : (
              displayContent && <Response content={displayContent} />
            )}

            {isLast && !isStreaming && displayContent && (
              <CopyButton text={displayContent} />
            )}
          </div>
        )}

        <span className="px-1 text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
          {formatTimestamp(normalized.timestamp)}
        </span>
      </div>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="absolute -right-10 top-1 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
      onClick={handleCopy}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </Button>
  )
}

function extractTextContent(content: MessageContentBlock[]): string {
  return content
    .filter((block) => block.type === 'text' && block.text)
    .map((block) => block.text!)
    .join('\n')
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
}
