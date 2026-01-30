import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  FolderSearch,
  Globe,
  Loader2,
  Search,
  Terminal,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { ToolStreamEntry } from '@/lib/gateway/types'

const TOOL_ICONS: Record<string, typeof Search> = {
  WebSearch: Search,
  WebFetch: Globe,
  Read: FileText,
  Bash: Terminal,
  Glob: FolderSearch,
  Grep: Search,
  Task: Terminal,
}

const TOOL_COLORS: Record<string, string> = {
  WebSearch: 'text-blue-500 bg-blue-500/10',
  WebFetch: 'text-purple-500 bg-purple-500/10',
  Read: 'text-green-500 bg-green-500/10',
  Bash: 'text-orange-500 bg-orange-500/10',
  Glob: 'text-yellow-500 bg-yellow-500/10',
  Grep: 'text-cyan-500 bg-cyan-500/10',
  Task: 'text-pink-500 bg-pink-500/10',
}

function getToolColor(name: string) {
  if (TOOL_COLORS[name]) return TOOL_COLORS[name]
  if (name.startsWith('mcp__')) return 'text-indigo-500 bg-indigo-500/10'
  return 'text-gray-500 bg-gray-500/10'
}

function getDisplayName(name: string) {
  if (name.startsWith('mcp__')) {
    const parts = name.split('__')
    return parts[parts.length - 1]?.replace(/_/g, ' ') ?? name
  }
  return name
}

const STATUS_ICONS = {
  start: Loader2,
  update: Loader2,
  result: CheckCircle2,
} as const

interface ToolCallComponentProps {
  tool: ToolStreamEntry
  isLast?: boolean
}

function ToolCallComponent({ tool, isLast }: ToolCallComponentProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const ToolIcon = TOOL_ICONS[tool.name] || Terminal
  const colorClass = getToolColor(tool.name)
  const isRunning = tool.phase !== 'result'
  const StatusIcon = STATUS_ICONS[tool.phase] || Clock

  const statusColor = isRunning
    ? 'text-blue-500 animate-spin'
    : 'text-green-500'

  const formatInput = (input: unknown): string => {
    if (typeof input === 'string') return input
    if (typeof input === 'object' && input !== null) {
      const obj = input as Record<string, unknown>
      if ('query' in obj) return String(obj.query)
      if ('pattern' in obj) return String(obj.pattern)
      if ('file_path' in obj) return String(obj.file_path)
      if ('command' in obj) return String(obj.command)
      if ('url' in obj) return String(obj.url)
      if ('message' in obj) return String(obj.message)
      if (Object.keys(obj).length === 0) return '(no arguments)'
      const keys = Object.keys(obj)
      if (keys.length <= 2) {
        return keys.map((k) => `${k}: ${String(obj[k]).slice(0, 50)}`).join(', ')
      }
      return `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', ...' : ''}}`
    }
    return String(input)
  }

  const elapsed = tool.updatedAt - tool.startedAt

  return (
    <div className={cn('relative', !isLast && 'pb-2')}>
      {!isLast && (
        <div className="absolute left-4 top-8 bottom-0 w-px bg-border" />
      )}

      <button
        type="button"
        className={cn(
          'flex w-full items-start gap-3 p-2 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors text-left',
          isExpanded && 'bg-muted/30',
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-md',
            colorClass,
          )}
        >
          <ToolIcon className="size-4" />
        </div>

        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm capitalize truncate">
              {getDisplayName(tool.name)}
            </span>
            <StatusIcon className={cn('size-3.5 shrink-0', statusColor)} />
            {isExpanded ? (
              <ChevronDown className="size-3.5 text-muted-foreground ml-auto shrink-0" />
            ) : (
              <ChevronRight className="size-3.5 text-muted-foreground ml-auto shrink-0" />
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5 max-w-full">
            {formatInput(tool.args)}
          </p>
        </div>
      </button>

      {isExpanded && (
        <div className="ml-11 mt-2 space-y-2">
          {tool.args !== undefined && (
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Input
              </p>
              <pre className="text-xs overflow-x-auto whitespace-pre-wrap break-all">
                {typeof tool.args === 'object'
                  ? JSON.stringify(tool.args, null, 2)
                  : String(tool.args)}
              </pre>
            </div>
          )}

          {tool.output !== undefined && (
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Result
              </p>
              <pre className="text-xs overflow-x-auto whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                {tool.output.length > 500
                  ? `${tool.output.slice(0, 500)}...`
                  : tool.output}
              </pre>
            </div>
          )}

          {!isRunning && elapsed > 0 && (
            <p className="text-xs text-muted-foreground">
              Completed in {(elapsed / 1000).toFixed(2)}s
            </p>
          )}
        </div>
      )}
    </div>
  )
}

interface ToolCallListProps {
  tools: ToolStreamEntry[]
}

export function ToolCallList({ tools }: ToolCallListProps) {
  if (tools.length === 0) return null

  return (
    <div className="space-y-1 my-3">
      <p className="text-xs font-medium text-muted-foreground mb-2">
        Tool Calls
      </p>
      {tools.map((tool, index) => (
        <ToolCallComponent
          key={tool.toolCallId}
          tool={tool}
          isLast={index === tools.length - 1}
        />
      ))}
    </div>
  )
}
