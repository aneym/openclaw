import { cn } from '@/lib/utils'
import type { ToolCallPart, ToolResultPart } from '@/types/message'

interface ToolCallChipProps {
  part: ToolCallPart | ToolResultPart
  onClick?: () => void
}

/**
 * Get the icon for a tool based on its name.
 * Icons are specified in SPEC-kos-chat.md:
 * - Read → 📖
 * - Write → 📝
 * - Edit → ✏️
 * - exec → ⚡
 * - web_search → 🔍
 * - web_fetch → 🌐
 * - browser → 🖥
 * - message → 💬
 * - Default → 🔧
 */
function getToolIcon(toolName: string): string {
  const iconMap: Record<string, string> = {
    Read: '📖',
    Write: '📝',
    Edit: '✏️',
    exec: '⚡',
    web_search: '🔍',
    web_fetch: '🌐',
    browser: '🖥',
    message: '💬'
  }

  return iconMap[toolName] || '🔧'
}

/**
 * Extract display details from tool args/result.
 * For file tools (Read/Write/Edit), show the file path.
 * For exec, show the command (truncated).
 */
function getToolDetails(part: ToolCallPart | ToolResultPart): string | null {
  const { toolName } = part

  // File tools: extract file_path from args
  if (['Read', 'Write', 'Edit'].includes(toolName) && part.type === 'tool-call') {
    const filePath = part.args.file_path as string | undefined
    if (filePath) {
      // Truncate long paths: show filename if path is too long
      if (filePath.length > 40) {
        const filename = filePath.split('/').pop() || filePath
        return `.../${filename}`
      }
      return filePath
    }
  }

  // exec: show command (truncated)
  if (toolName === 'exec' && part.type === 'tool-call') {
    const command = part.args.command as string | undefined
    if (command) {
      return command.length > 40 ? command.slice(0, 37) + '...' : command
    }
  }

  return null
}

/**
 * Format duration for exec results (if available)
 */
function formatDuration(ms?: number): string | null {
  if (!ms) return null
  return `${(ms / 1000).toFixed(1)}s`
}

export function ToolCallChip({ part, onClick }: ToolCallChipProps) {
  const icon = getToolIcon(part.toolName)
  const details = getToolDetails(part)
  const isResult = part.type === 'tool-result'
  const isError = isResult && part.isError

  // For exec results, try to extract duration from result metadata
  // (This is a placeholder - actual duration extraction depends on gateway format)
  const duration = isResult && part.toolName === 'exec' ? null : null

  const isClickable = ['Read', 'Write', 'Edit'].includes(part.toolName)

  return (
    <button
      onClick={isClickable ? onClick : undefined}
      disabled={!isClickable}
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors',
        'border border-border/50',
        isError
          ? 'bg-destructive/10 text-destructive border-destructive/30'
          : isResult
            ? 'bg-muted/50 text-foreground'
            : 'bg-muted/30 text-muted-foreground',
        isClickable && 'cursor-pointer hover:bg-muted/70 hover:border-border',
        !isClickable && 'cursor-default'
      )}
    >
      <span className="text-sm leading-none">{icon}</span>
      <span className="font-mono">{part.toolName}</span>
      {details && (
        <>
          <span className="text-muted-foreground/50">·</span>
          <span className="truncate max-w-[200px]">{details}</span>
        </>
      )}
      {duration && (
        <>
          <span className="text-muted-foreground/50">·</span>
          <span className="text-muted-foreground">({duration})</span>
        </>
      )}
    </button>
  )
}
