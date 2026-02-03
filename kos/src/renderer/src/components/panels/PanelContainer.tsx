import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import type { PanelNode } from '../../types'
import { usePanelStore } from '../../stores/panel-store'
import { PanelContent } from './PanelContent'
import { PanelToolbar } from './PanelToolbar'

interface PanelContainerProps {
  threadId: string
}

export function PanelContainer({ threadId }: PanelContainerProps) {
  const layout = usePanelStore((s) => s.getLayout(threadId))

  // Default: single chat panel if no layout exists
  if (!layout) {
    return (
      <div className="h-full w-full">
        <PanelContent type="chat" threadId={threadId} />
      </div>
    )
  }

  return <RenderNode node={layout.root} threadId={threadId} />
}

interface RenderNodeProps {
  node: PanelNode
  threadId: string
}

function RenderNode({ node, threadId }: RenderNodeProps) {
  // Leaf node: render the panel content with toolbar
  if (node.type === 'leaf') {
    return (
      <div className="h-full w-full flex flex-col">
        <PanelToolbar
          panelId={node.panelId}
          panelType={node.panelType}
          threadId={threadId}
        />
        <div className="flex-1 overflow-hidden">
          <PanelContent type={node.panelType} props={node.props} threadId={threadId} />
        </div>
      </div>
    )
  }

  // Branch node: render a resizable split with two children
  return (
    <PanelGroup direction={node.direction}>
      <Panel defaultSize={node.sizes[0]} minSize={20}>
        <RenderNode node={node.children[0]} threadId={threadId} />
      </Panel>

      <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors data-[resize-handle-state=drag]:bg-primary" />

      <Panel defaultSize={node.sizes[1]} minSize={20}>
        <RenderNode node={node.children[1]} threadId={threadId} />
      </Panel>
    </PanelGroup>
  )
}
