import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { ChatMessage } from '@/types/message'
import { Button } from '@/components/ui/button'
import { ChevronDown, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MessageGroup } from './MessageGroup'
import { StreamingIndicator } from './StreamingIndicator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

interface MessageListProps {
  messages: ChatMessage[]
  isStreaming?: boolean
  className?: string
}

interface MessageGrouping {
  role: 'user' | 'assistant' | 'system' | 'tool'
  messages: ChatMessage[]
}

function groupConsecutiveMessages(messages: ChatMessage[]): MessageGrouping[] {
  const groups: MessageGrouping[] = []
  let currentGroup: MessageGrouping | null = null

  for (const message of messages) {
    if (currentGroup && currentGroup.role === message.role) {
      // Add to current group
      currentGroup.messages.push(message)
    } else {
      // Start new group
      currentGroup = {
        role: message.role,
        messages: [message],
      }
      groups.push(currentGroup)
    }
  }

  return groups
}

export function MessageList({ messages, isStreaming, className }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [hasNewMessages, setHasNewMessages] = useState(false)
  const prevMessageCountRef = useRef(messages.length)

  // Group consecutive same-role messages
  const messageGroups = useMemo(() => groupConsecutiveMessages(messages), [messages])

  // Track when we're at the bottom using IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsAtBottom(entry.isIntersecting)

        // Clear "new messages" badge when we reach the bottom
        if (entry.isIntersecting) {
          setHasNewMessages(false)
        }
      },
      {
        root: containerRef.current,
        threshold: 0.1,
      }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  // Auto-scroll when new messages arrive (if at bottom)
  useEffect(() => {
    const hasNewMessage = messages.length > prevMessageCountRef.current
    prevMessageCountRef.current = messages.length

    if (!hasNewMessage) return

    if (isAtBottom) {
      // Smooth scroll to bottom
      sentinelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    } else {
      // Show "new messages" badge when scrolled up
      setHasNewMessages(true)
    }
  }, [messages.length, isAtBottom])

  // Auto-scroll during streaming (if at bottom)
  useEffect(() => {
    if (isStreaming && isAtBottom) {
      sentinelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [isStreaming, isAtBottom])

  // Scroll to bottom handler
  const scrollToBottom = useCallback(() => {
    sentinelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [])

  return (
    <div className="relative flex flex-col h-full">
      {/* Scrollable message container */}
      <div
        ref={containerRef}
        className={cn(
          'flex-1 overflow-y-auto overflow-x-hidden',
          'px-4 py-4',
          className
        )}
      >
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No messages yet. Start a conversation!
          </div>
        ) : (
          <div className="space-y-6">
            {messageGroups.map((group, idx) => {
              // Check if this is the last group and if it's streaming
              const isLastGroup = idx === messageGroups.length - 1
              const shouldShowStreaming = isLastGroup && isStreaming

              return (
                <MessageGroup
                  key={`group-${idx}-${group.messages[0].id}`}
                  messages={group.messages}
                  role={group.role}
                  isStreaming={shouldShowStreaming}
                />
              )
            })}

            {/* Show streaming indicator when waiting for assistant response */}
            {isStreaming && messageGroups.length > 0 && messageGroups[messageGroups.length - 1].role !== 'assistant' && (
              <div className="flex gap-3">
                <div className="flex-shrink-0">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-purple-500 text-white">
                      <Bot className="w-4 h-4" />
                    </AvatarFallback>
                  </Avatar>
                </div>
                <div className="flex flex-col gap-2 flex-1 min-w-0">
                  <div className="rounded-lg px-3 py-2 max-w-[85%] bg-muted text-foreground">
                    <StreamingIndicator className="opacity-60" />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

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
          >
            <ChevronDown className="w-4 h-4" />
            New messages
          </Button>
        </div>
      )}
    </div>
  )
}
