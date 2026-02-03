import { Card } from '../ui/card'
import {
  BookOpen,
  Search,
  Pencil,
  FileEdit,
  Terminal,
  Globe,
  Code,
  Wrench,
  FlaskConical,
  FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CodingPhase } from './PhaseIndicator'

interface CodingEvent {
  id: string
  type: 'tool-call' | 'tool-result' | 'text' | 'phase-change'
  toolName?: string
  args?: Record<string, unknown>
  text?: string
  phase: CodingPhase
  timestamp: number
  duration?: number
}

interface SessionTimelineProps {
  events: CodingEvent[]
  className?: string
}

function getToolIcon(toolName: string) {
  switch (toolName) {
    case 'Read':
      return <BookOpen className="w-4 h-4" />
    case 'Grep':
    case 'Glob':
    case 'LSP':
      return <Search className="w-4 h-4" />
    case 'Edit':
    case 'NotebookEdit':
      return <FileEdit className="w-4 h-4" />
    case 'Write':
      return <Pencil className="w-4 h-4" />
    case 'Bash':
    case 'exec':
      return <Terminal className="w-4 h-4" />
    case 'web_search':
    case 'web_fetch':
      return <Globe className="w-4 h-4" />
    case 'Task':
      return <Code className="w-4 h-4" />
    default:
      return <Wrench className="w-4 h-4" />
  }
}

function getToolDescription(event: CodingEvent): string {
  if (event.type === 'text') {
    return event.text || 'Text output'
  }

  if (event.type === 'phase-change') {
    return `Entered ${event.phase} phase`
  }

  if (!event.toolName) {
    return 'Unknown event'
  }

  const toolName = event.toolName

  // Build description based on tool and args
  if (toolName === 'Read') {
    const filePath = event.args?.file_path as string | undefined
    return filePath ? `Read ${truncatePath(filePath)}` : 'Read file'
  }

  if (toolName === 'Write') {
    const filePath = event.args?.file_path as string | undefined
    return filePath ? `Write ${truncatePath(filePath)}` : 'Write file'
  }

  if (toolName === 'Edit') {
    const filePath = event.args?.file_path as string | undefined
    return filePath ? `Edit ${truncatePath(filePath)}` : 'Edit file'
  }

  if (toolName === 'Bash' || toolName === 'exec') {
    const cmd = event.args?.command as string | undefined
    return cmd ? `Run: ${truncateCommand(cmd)}` : 'Execute command'
  }

  if (toolName === 'Grep') {
    const pattern = event.args?.pattern as string | undefined
    return pattern ? `Search: ${pattern}` : 'Search files'
  }

  if (toolName === 'Glob') {
    const pattern = event.args?.pattern as string | undefined
    return pattern ? `Find: ${pattern}` : 'Find files'
  }

  if (toolName === 'web_search') {
    const query = event.args?.query as string | undefined
    return query ? `Search: ${query}` : 'Web search'
  }

  if (toolName === 'web_fetch') {
    const url = event.args?.url as string | undefined
    return url ? `Fetch: ${url}` : 'Fetch URL'
  }

  if (toolName === 'Task') {
    const description = event.args?.description as string | undefined
    return description || 'Subtask'
  }

  // Generic fallback
  return toolName
}

function truncatePath(path: string, maxLength: number = 40): string {
  if (path.length <= maxLength) {
    return path
  }

  const parts = path.split('/')
  if (parts.length <= 2) {
    return `...${path.slice(-maxLength)}`
  }

  // Show filename and parent directory
  const filename = parts[parts.length - 1]
  const parent = parts[parts.length - 2]
  return `.../${parent}/${filename}`
}

function truncateCommand(cmd: string, maxLength: number = 50): string {
  if (cmd.length <= maxLength) {
    return cmd
  }
  return cmd.slice(0, maxLength) + '...'
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

export function SessionTimeline({ events, className }: SessionTimelineProps) {
  if (events.length === 0) {
    return (
      <Card className={cn('p-6 text-center', className)}>
        <div className="flex flex-col items-center gap-2">
          <FlaskConical className="w-8 h-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No events yet</p>
          <p className="text-xs text-muted-foreground">
            Waiting for coding session activity...
          </p>
        </div>
      </Card>
    )
  }

  return (
    <div className={cn('space-y-1', className)}>
      {events.map((event, index) => {
        const isPhaseChange = event.type === 'phase-change'
        const isLast = index === events.length - 1

        return (
          <div key={event.id} className="relative">
            {/* Timeline connector line */}
            {!isLast && (
              <div
                className={cn(
                  'absolute left-3 top-6 bottom-0 w-px bg-border',
                  isPhaseChange && 'bg-primary/30'
                )}
              />
            )}

            {/* Event card */}
            <div className="flex gap-3 items-start">
              {/* Icon */}
              <div
                className={cn(
                  'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center',
                  'bg-background border-2',
                  isPhaseChange
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-muted/50',
                  getPhaseColor(event.phase)
                )}
              >
                {event.toolName ? getToolIcon(event.toolName) : <FileText className="w-3 h-3" />}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        'text-sm font-medium truncate',
                        isPhaseChange ? 'text-primary' : 'text-foreground'
                      )}
                    >
                      {getToolDescription(event)}
                    </p>

                    {/* Tool result indicator */}
                    {event.type === 'tool-result' && (
                      <p className="text-xs text-muted-foreground mt-0.5">Result received</p>
                    )}
                  </div>

                  {/* Duration badge */}
                  {event.duration && (
                    <div className="flex-shrink-0">
                      <span className="text-xs text-muted-foreground font-mono">
                        {formatDuration(event.duration)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
