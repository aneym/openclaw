import { useState } from 'react'
import { ChevronRight, Brain } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TextPart } from './TextPart'

interface ReasoningBlockProps {
  reasoning: string
  durationMs?: number
}

export function ReasoningBlock({ reasoning, durationMs }: ReasoningBlockProps) {
  const [open, setOpen] = useState(false)
  const durationStr = durationMs ? `${(durationMs / 1000).toFixed(1)}s` : ''

  return (
    <div className="reasoning-block">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-1 py-0.5 rounded hover:bg-muted/50"
      >
        <Brain className="w-3.5 h-3.5 text-purple-400" />
        <span>
          {open ? 'Hide reasoning' : `Thought${durationStr ? ` for ${durationStr}` : ''}...`}
        </span>
        <ChevronRight
          className={cn('w-3 h-3 transition-transform', open && 'rotate-90')}
        />
      </button>
      {open && (
        <div className="mt-1 pl-4 border-l-2 border-purple-400/30 text-sm text-muted-foreground">
          <TextPart text={reasoning} />
        </div>
      )}
    </div>
  )
}
