import { X, SplitSquareHorizontal, SplitSquareVertical } from 'lucide-react'
import type { PanelType } from '../../types'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../ui/dropdown-menu'

interface PanelToolbarProps {
  panelId: string
  panelType: PanelType
  title?: string
  threadId: string
  onSplit?: (direction: 'horizontal' | 'vertical') => void
  onClose?: () => void
}

export function PanelToolbar({
  panelType,
  title,
  onSplit,
  onClose
}: PanelToolbarProps) {
  // Generate title from panel type if not provided
  const displayTitle = title ?? getPanelTitle(panelType)

  return (
    <div className="group/toolbar h-8 flex items-center justify-between px-3 border-b border-border bg-background/50 opacity-0 hover:opacity-100 transition-opacity duration-200">
      <div className="flex items-center gap-2 text-sm text-foreground/70 font-medium">
        <span className="mr-1">{getPanelIcon(panelType)}</span>
        <span className="truncate">{displayTitle}</span>
      </div>

      <div className="flex items-center gap-1">
        {onSplit != null && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <SplitSquareHorizontal className="h-3.5 w-3.5" />
                <span className="sr-only">Split panel</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onSplit('horizontal')}>
                <SplitSquareHorizontal className="mr-2 h-4 w-4" />
                <span>Split Right</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSplit('vertical')}>
                <SplitSquareVertical className="mr-2 h-4 w-4" />
                <span>Split Down</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {onClose != null && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
            <span className="sr-only">Close panel</span>
          </Button>
        )}
      </div>
    </div>
  )
}

function getPanelIcon(type: PanelType): string {
  switch (type) {
    case 'chat':
      return '💬'
    case 'code-editor':
      return '📄'
    case 'terminal':
      return '⌨️'
    case 'coding-session':
      return '🔨'
    case 'linear-board':
      return '📋'
    case 'browser':
      return '🌐'
    case 'preview':
      return '👁️'
    case 'diff':
      return '🔄'
    case 'empty':
      return '⬜'
    default:
      return '❓'
  }
}

function getPanelTitle(type: PanelType): string {
  switch (type) {
    case 'chat':
      return 'Chat'
    case 'code-editor':
      return 'Code Editor'
    case 'terminal':
      return 'Terminal'
    case 'coding-session':
      return 'Coding Session'
    case 'linear-board':
      return 'Linear Board'
    case 'browser':
      return 'Browser'
    case 'preview':
      return 'Preview'
    case 'diff':
      return 'Diff'
    case 'empty':
      return 'Empty Panel'
    default:
      return 'Unknown'
  }
}
