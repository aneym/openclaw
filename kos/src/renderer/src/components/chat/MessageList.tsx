import { useEffect, useRef, useState, useCallback } from 'react'
import { ChatMessage } from '@/types/message'
import { Button } from '@/components/ui/button'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MessageListProps {
  messages: ChatMessage[]
  isStreaming?: boolean
  className?: string
}

export function MessageList({ messages, isStreaming, className }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [hasNewMessages, setHasNewMessages] = useState(false)
  const prevMessageCountRef = useRef(messages.length)

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
          <div className="space-y-4">
            {messages.map((message) => (
              <div key={message.id} className="text-sm">
                <div className="font-medium mb-1 capitalize">{message.role}</div>
                <div className="text-muted-foreground">
                  {message.parts.map((part, idx) => {
                    if (part.type === 'text') {
                      return <div key={idx}>{part.text}</div>
                    }
                    return <div key={idx}>[{part.type}]</div>
                  })}
                </div>
              </div>
            ))}
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
