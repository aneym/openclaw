import { Badge } from '../ui/badge'
import { cn } from '@/lib/utils'

export type CodingPhase = 'exploring' | 'planning' | 'building' | 'testing' | 'complete' | 'error'

interface PhaseIndicatorProps {
  phase: CodingPhase
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

export function PhaseIndicator({ phase, className }: PhaseIndicatorProps) {
  const icon = getPhaseIcon(phase)
  const label = getPhaseLabel(phase)
  const color = getPhaseColor(phase)

  return (
    <Badge variant="outline" className={cn('gap-1.5', color, className)}>
      <span>{icon}</span>
      <span className="font-medium">{label}</span>
    </Badge>
  )
}
