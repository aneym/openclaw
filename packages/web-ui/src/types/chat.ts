export type MessageRole = 'user' | 'assistant' | 'system' | 'toolResult'

export interface MessageContentBlock {
  type: string
  text?: string
  name?: string
  args?: unknown
  arguments?: unknown
  source?: {
    type: string
    media_type: string
    data: string
  }
  thinking?: string
}

export interface NormalizedMessage {
  role: MessageRole
  content: MessageContentBlock[]
  timestamp: number
  id?: string
  toolCallId?: string
  runId?: string
}

export function normalizeMessage(message: unknown): NormalizedMessage {
  const m = message as Record<string, unknown>
  let role: MessageRole =
    typeof m.role === 'string' ? (m.role as MessageRole) : 'assistant'

  const hasToolId =
    typeof m.toolCallId === 'string' || typeof m.tool_call_id === 'string'
  const contentRaw = m.content
  const contentItems = Array.isArray(contentRaw) ? contentRaw : null
  const hasToolContent =
    Array.isArray(contentItems) &&
    contentItems.some((item) => {
      const x = item as Record<string, unknown>
      const t = String(x.type ?? '').toLowerCase()
      return t === 'toolresult' || t === 'tool_result'
    })

  if (hasToolId || hasToolContent) {
    role = 'toolResult'
  }

  let content: MessageContentBlock[] = []
  if (typeof m.content === 'string') {
    content = [{ type: 'text', text: m.content }]
  } else if (Array.isArray(m.content)) {
    content = m.content.map((item: Record<string, unknown>) => ({
      type: (item.type as string) || 'text',
      text: item.text as string | undefined,
      name: item.name as string | undefined,
      args: item.args || item.arguments,
      source: item.source as MessageContentBlock['source'],
      thinking: item.thinking as string | undefined,
    }))
  } else if (typeof m.text === 'string') {
    content = [{ type: 'text', text: m.text }]
  }

  const timestamp = typeof m.timestamp === 'number' ? m.timestamp : Date.now()
  const id = typeof m.id === 'string' ? m.id : undefined

  return { role, content, timestamp, id }
}
