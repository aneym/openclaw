import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { Send } from 'lucide-react'
import { useGatewayStore } from '../../stores/gateway-store'
import { cn } from '../../lib/utils'

interface ComposeBarProps {
  sessionKey: string
  disabled?: boolean
}

export function ComposeBar({ sessionKey, disabled = false }: ComposeBarProps) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { request, connected } = useGatewayStore()

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto'

    // Set height based on content, max 200px
    const newHeight = Math.min(textarea.scrollHeight, 200)
    textarea.style.height = `${newHeight}px`
  }, [text])

  const canSend = connected && !disabled && text.trim().length > 0

  const handleSend = async () => {
    if (!canSend) return

    const messageText = text.trim()
    setText('')

    try {
      await request('session.sendMessage', {
        sessionKey,
        message: messageText
      })
    } catch (err) {
      console.error('[compose] send failed:', err)
      // TODO: Show error toast
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter = send (unless Shift is held)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  return (
    <div className="border-t border-border bg-background p-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            !connected
              ? 'Disconnected...'
              : disabled
                ? 'Waiting...'
                : 'Type a message...'
          }
          disabled={!connected || disabled}
          rows={1}
          className={cn(
            'flex-1 resize-none rounded-md border border-input bg-background px-3 py-2',
            'text-sm placeholder:text-muted-foreground',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'min-h-[40px] max-h-[200px]'
          )}
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          className={cn(
            'inline-flex h-10 items-center justify-center rounded-md px-4',
            'text-sm font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            'disabled:pointer-events-none disabled:opacity-50',
            canSend
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-muted text-muted-foreground'
          )}
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
