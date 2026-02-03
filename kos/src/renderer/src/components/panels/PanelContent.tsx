import type { PanelType } from '../../types'
import { ChatPanel } from './ChatPanel'
import { LinearBoard } from '../linear/LinearBoard'
import { CodingSessionPanel } from '../coding/CodingSessionPanel'
import { useWorkspaceStore } from '../../stores/workspace-store'
import { useThreadStore } from '../../stores/thread-store'

interface PanelContentProps {
  type: PanelType
  props?: Record<string, unknown>
  threadId: string
}

export function PanelContent({ type, props, threadId }: PanelContentProps) {
  const activeWorkspace = useWorkspaceStore((state) => state.activeWorkspace)
  const getThread = useThreadStore((state) => state.getThread)

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
      const sessionKey = props?.sessionKey ?? threadId
      return <CodingSessionPanel sessionKey={String(sessionKey)} />
    }

    case 'linear-board': {
      // Get teamId from panel props or thread
      const teamId = props?.teamId as string | undefined
      const linearApiKey = activeWorkspace?.linearApiKey

      if (!teamId) {
        return (
          <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
            <p className="text-sm">No Linear team configured</p>
            <p className="text-xs mt-2">Configure a Linear team for this project</p>
          </div>
        )
      }

      if (!linearApiKey) {
        return (
          <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
            <p className="text-sm">No Linear API key configured</p>
            <p className="text-xs mt-2">Add a Linear API key in workspace settings</p>
          </div>
        )
      }

      // Get projectId from thread if available
      const thread = getThread(threadId)
      const projectId = thread?.projectId

      return <LinearBoard teamId={teamId} apiKey={linearApiKey} projectId={projectId} />
    }

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
