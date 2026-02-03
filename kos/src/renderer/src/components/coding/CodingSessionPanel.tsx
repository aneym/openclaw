import { useState } from 'react'
import { ScrollArea } from '../ui/scroll-area'
import { Card } from '../ui/card'
import { Badge } from '../ui/badge'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCodingSession } from './hooks/useCodingSession'
import { SessionTimeline } from './SessionTimeline'

export type CodingPhase = 'exploring' | 'planning' | 'building' | 'testing' | 'complete' | 'error'

interface CodingSessionPanelProps {
  sessionKey: string
  className?: string
}

function getPhaseIcon(phase: CodingPhase): string {
  switch (phase) {
    case 'exploring':
      return '🔍'
    case 'planning':
      return '🧠'
    case 'building':
      return '🔨'
    case 'testing':
      return '🧪'
    case 'complete':
      return '✅'
    case 'error':
      return '❌'
    default:
      return '🔧'
  }
}

function getPhaseColor(phase: CodingPhase): string {
  switch (phase) {
    case 'exploring':
      return 'text-blue-500 dark:text-blue-400'
    case 'planning':
      return 'text-purple-500 dark:text-purple-400'
    case 'building':
      return 'text-amber-500 dark:text-amber-400'
    case 'testing':
      return 'text-green-500 dark:text-green-400'
    case 'complete':
      return 'text-green-600 dark:text-green-500'
    case 'error':
      return 'text-red-500 dark:text-red-400'
    default:
      return 'text-foreground'
  }
}

function getPhaseLabel(phase: CodingPhase): string {
  return phase.charAt(0).toUpperCase() + phase.slice(1)
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

function PhaseIndicator({ phase }: { phase: CodingPhase }) {
  const icon = getPhaseIcon(phase)
  const label = getPhaseLabel(phase)
  const color = getPhaseColor(phase)

  return (
    <Badge variant="outline" className={cn('gap-1.5', color)}>
      <span>{icon}</span>
      <span className="font-medium">{label}</span>
    </Badge>
  )
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
