import { useMemo } from 'react'
import { ChatMessage } from '@/types/message'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Bot, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TextPart } from './TextPart'

interface MessageGroupProps {
  messages: ChatMessage[]
  role: 'user' | 'assistant' | 'system' | 'tool'
  isStreaming?: boolean
}

function isToolOnlyMessage(message: ChatMessage): boolean {
  // A message is tool-only if it contains only tool-call or tool-result parts
  return (
    message.parts.length > 0 &&
    message.parts.every((p) => p.type === 'tool-call' || p.type === 'tool-result')
  )
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()

  if (isToday) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = date.toDateString() === yesterday.toDateString()

  if (isYesterday) {
    return `Yesterday ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function RoleAvatar({ role }: { role: 'user' | 'assistant' | 'system' | 'tool' }) {
  if (role === 'user') {
    return (
      <Avatar className="w-8 h-8">
        <AvatarFallback className="bg-blue-500 text-white">
          <User className="w-4 h-4" />
        </AvatarFallback>
      </Avatar>
    )
  }

  if (role === 'assistant') {
    return (
      <Avatar className="w-8 h-8">
        <AvatarFallback className="bg-purple-500 text-white">
          <Bot className="w-4 h-4" />
        </AvatarFallback>
      </Avatar>
    )
  }

  // System/tool messages
  return (
    <Avatar className="w-8 h-8">
      <AvatarFallback className="bg-gray-500 text-white text-xs">
        {role[0].toUpperCase()}
      </AvatarFallback>
    </Avatar>
  )
}

function GroupFooter({
  role,
  timestamp,
}: {
  role: 'user' | 'assistant' | 'system' | 'tool'
  timestamp: number
}) {
  const roleLabel = role === 'assistant' ? 'Bot' : role === 'user' ? 'You' : role
  const timeStr = formatTimestamp(timestamp)

  return (
    <div className="text-xs text-muted-foreground mt-1 px-1">
      {roleLabel} · {timeStr}
    </div>
  )
}

export function MessageGroup({ messages, role, isStreaming }: MessageGroupProps) {
  // Batch consecutive tool-only messages and regular messages
  const rendered = useMemo(() => {
    const items: React.ReactNode[] = []
    let toolBatch: ChatMessage[] = []

    const flushTools = () => {
      if (toolBatch.length === 0) return
      const count = toolBatch.reduce(
        (sum, m) => sum + m.parts.filter((p) => p.type === 'tool-call' || p.type === 'tool-result').length,
        0
      )
      // TODO: Replace with actual ToolCallGroup component when it's built
      items.push(
        <div
          key={`tools-${items.length}`}
          className="text-xs text-muted-foreground border border-border rounded-md px-2 py-1"
        >
          🔧 {count} tool call{count !== 1 ? 's' : ''}
        </div>
      )
      toolBatch = []
    }

    for (const msg of messages) {
      if (isToolOnlyMessage(msg)) {
        toolBatch.push(msg)
      } else {
        flushTools()
        // TODO: Replace with actual MessageBubble component when it's built
        items.push(
          <div
            key={msg.id}
            className={cn(
              'rounded-lg px-3 py-2 max-w-[85%]',
              role === 'user'
                ? 'bg-blue-500 text-white self-end'
                : 'bg-muted text-foreground self-start'
            )}
          >
            {msg.parts.map((part, idx) => {
              if (part.type === 'text') {
                return (
                  <TextPart
                    key={idx}
                    text={part.text}
                    isStreaming={isStreaming && msg === messages.at(-1)}
                  />
                )
              }
              if (part.type === 'reasoning') {
                return (
                  <div key={idx} className="text-xs opacity-70 italic border-l-2 pl-2 my-1">
                    💭 {part.reasoning}
                  </div>
                )
              }
              return (
                <div key={idx} className="text-xs opacity-70">
                  [{part.type}]
                </div>
              )
            })}
            {isStreaming && msg === messages.at(-1) && (
              <span className="inline-block w-1 h-4 bg-current animate-pulse ml-1" />
            )}
          </div>
        )
      }
    }
    flushTools()
    return items
  }, [messages, isStreaming, role])

  if (messages.length === 0) return null

  return (
    <div className={cn('flex gap-3', role === 'user' ? 'flex-row-reverse' : '')}>
      {/* Avatar */}
      <div className="flex-shrink-0">
        <RoleAvatar role={role} />
      </div>

      {/* Message bubbles + footer */}
      <div className="flex flex-col gap-2 flex-1 min-w-0">
        {rendered}
        <GroupFooter role={role} timestamp={messages[0].createdAt} />
      </div>
    </div>
  )
}
