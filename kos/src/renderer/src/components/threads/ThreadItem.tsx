import { formatRelativeTime } from '../../lib/time-utils'
import { useSession } from '../../gateway/hooks'
import type { Thread } from '../../types'

interface ThreadItemProps {
  thread: Thread
  isActive: boolean
  onClick: () => void
}

export function ThreadItem({ thread, isActive, onClick }: ThreadItemProps) {
  const { isStreaming } = useSession(thread.sessionKey)

  // Determine status for the dot
  const status = isStreaming ? 'streaming' : thread.status === 'active' ? 'idle' : 'idle'

  // Status dot color
  const statusDotColor =
    status === 'streaming'
      ? 'bg-blue-500'
      : status === 'idle'
        ? 'bg-muted-foreground/30'
        : 'bg-muted-foreground/30'

  // Relative timestamp
  const relativeTime = formatRelativeTime(thread.lastMessageAt)

  return (
    <button
      onClick={onClick}
      className={`w-full px-3 py-2 ml-6 rounded-md text-left transition-colors group ${
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'
      }`}
    >
      <div className="flex items-start gap-2">
        {/* Status dot */}
        <div className="mt-1.5 shrink-0">
          <div className={`h-2 w-2 rounded-full ${statusDotColor}`} />
        </div>

        {/* Thread content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <div className="font-medium truncate text-sm">{thread.title}</div>
            <div className="text-xs opacity-70 shrink-0">{relativeTime}</div>
          </div>
          {thread.subtitle && (
            <div className="text-xs opacity-70 truncate mt-0.5">{thread.subtitle}</div>
          )}
        </div>
      </div>
    </button>
  )
}
