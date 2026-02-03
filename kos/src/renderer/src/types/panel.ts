export interface PanelLayout {
  id: string
  threadId: string
  root: PanelNode
  updatedAt: number
}

export type PanelNode = PanelBranch | PanelLeaf

export interface PanelBranch {
  type: 'branch'
  direction: 'horizontal' | 'vertical'
  sizes: [number, number] // percentages, e.g. [60, 40]
  children: [PanelNode, PanelNode]
}

export interface PanelLeaf {
  type: 'leaf'
  panelId: string
  panelType: PanelType
  props?: Record<string, unknown> // panel-specific props (file path, session key, etc.)
}

export type PanelType =
  | 'chat' // Main chat view
  | 'code-editor' // File preview/edit
  | 'terminal' // Terminal output
  | 'coding-session' // CC/Codex session monitor
  | 'linear-board' // Linear kanban
  | 'browser' // Embedded web view
  | 'preview' // App preview (simulator, web)
  | 'diff' // Git diff view
  | 'empty' // Placeholder
