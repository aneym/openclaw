import { cn } from '@/lib/utils'

interface StreamingIndicatorProps {
  className?: string
}

/**
 * Three-dot animated reading indicator for empty streams.
 * Shows when the agent is processing but hasn't started outputting text yet.
 */
export function StreamingIndicator({ className }: StreamingIndicatorProps) {
  return (
    <div className={cn('inline-flex items-center gap-1', className)}>
      <span
        className="w-2 h-2 bg-current rounded-full animate-bounce"
        style={{ animationDelay: '0ms', animationDuration: '1s' }}
      />
      <span
        className="w-2 h-2 bg-current rounded-full animate-bounce"
        style={{ animationDelay: '150ms', animationDuration: '1s' }}
      />
      <span
        className="w-2 h-2 bg-current rounded-full animate-bounce"
        style={{ animationDelay: '300ms', animationDuration: '1s' }}
      />
    </div>
  )
}
