import { useState } from 'react'
import { ScrollArea } from '../ui/scroll-area'
import { Card } from '../ui/card'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCodingSession } from './hooks/useCodingSession'
import { SessionTimeline } from './SessionTimeline'
import { PhaseIndicator } from './PhaseIndicator'

interface CodingSessionPanelProps {
  sessionKey: string
  className?: string
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) {
    return `${seconds}s`
  }
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

export function CodingSessionPanel({ sessionKey, className }: CodingSessionPanelProps) {
  const [sessionName] = useState('Coding Session')
  const { events, phase, duration, loading } = useCodingSession(sessionKey)

  return (
    <div className={cn('flex flex-col h-full bg-background', className)}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <PhaseIndicator phase={phase} />
            <span className="text-sm font-medium truncate">{sessionName}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="w-3.5 h-3.5" />
          <span className="font-mono">{formatDuration(duration)}</span>
        </div>
      </div>

      {/* Timeline */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {loading ? (
            <Card className="p-6 text-center">
              <p className="text-sm text-muted-foreground">Loading session events...</p>
            </Card>
          ) : (
            <SessionTimeline events={events} />
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
