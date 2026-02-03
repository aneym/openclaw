import type { PanelType } from '../../types'
import { ChatPanel } from './ChatPanel'

interface PanelContentProps {
  type: PanelType
  props?: Record<string, unknown>
  threadId: string
}

export function PanelContent({ type, props, threadId }: PanelContentProps) {
  switch (type) {
    case 'chat':
      return <ChatPanel threadId={threadId} />

    case 'code-editor': {
      const filePath = props?.filePath
      return (
        <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
          <p className="text-sm">Code Editor Panel</p>
          {filePath != null && (
            <p className="text-xs mt-2">File: {String(filePath)}</p>
          )}
        </div>
      )
    }

    case 'terminal':
      return (
        <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
          <p className="text-sm">Terminal Panel</p>
        </div>
      )

    case 'coding-session': {
      const sessionKey = props?.sessionKey
      return (
        <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
          <p className="text-sm">Coding Session Panel</p>
          {sessionKey != null && (
            <p className="text-xs mt-2">Session: {String(sessionKey)}</p>
          )}
        </div>
      )
    }

    case 'linear-board':
      return (
        <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
          <p className="text-sm">Linear Board Panel</p>
        </div>
      )

    case 'browser': {
      const url = props?.url
      return (
        <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
          <p className="text-sm">Browser Panel</p>
          {url != null && (
            <p className="text-xs mt-2">URL: {String(url)}</p>
          )}
        </div>
      )
    }

    case 'preview':
      return (
        <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
          <p className="text-sm">Preview Panel</p>
        </div>
      )

    case 'diff':
      return (
        <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
          <p className="text-sm">Diff Panel</p>
        </div>
      )

    case 'empty':
      return (
        <div className="flex flex-col items-center justify-center h-full bg-muted/20 text-muted-foreground border-2 border-dashed border-muted">
          <p className="text-sm">Empty Panel</p>
          <p className="text-xs mt-2">Split to add content</p>
        </div>
      )

    default:
      return (
        <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
          <p className="text-sm">Unknown panel type: {type}</p>
        </div>
      )
  }
}
