export type GatewayEventFrame = {
  type: 'event'
  event: string
  payload?: unknown
  seq?: number
  stateVersion?: { presence: number; health: number }
}

export type GatewayResponseFrame = {
  type: 'res'
  id: string
  ok: boolean
  payload?: unknown
  error?: { code: string; message: string; details?: unknown }
}

export type GatewayHelloOk = {
  type: 'hello-ok'
  protocol: number
  features?: { methods?: string[]; events?: string[] }
  snapshot?: unknown
  auth?: {
    deviceToken?: string
    role?: string
    scopes?: string[]
    issuedAtMs?: number
  }
  policy?: { tickIntervalMs?: number }
}

export type ChatEventPayload = {
  runId: string
  sessionKey: string
  seq: number
  state: 'delta' | 'final' | 'aborted' | 'error'
  message?: unknown
  errorMessage?: string
  usage?: unknown
  stopReason?: string
}

export type AgentEventPayload = {
  runId: string
  seq: number
  stream: string
  ts: number
  sessionKey?: string
  data: Record<string, unknown>
}

export type ToolStreamEntry = {
  toolCallId: string
  runId: string
  sessionKey?: string
  name: string
  args?: unknown
  output?: string
  startedAt: number
  updatedAt: number
  phase: 'start' | 'update' | 'result'
}

export type GatewaySessionRow = {
  key: string
  kind: 'direct' | 'group' | 'global' | 'unknown'
  label?: string
  displayName?: string
  surface?: string
  subject?: string
  updatedAt: number | null
  sessionId?: string
  thinkingLevel?: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  model?: string
}

export type SessionsListResult = {
  ts: number
  path: string
  count: number
  sessions: GatewaySessionRow[]
}

export type ChatMessage = {
  role: string
  content: ChatContentBlock[]
  timestamp: number
  id?: string
  toolCallId?: string
  runId?: string
}

export type ChatContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: string; media_type: string; data: string } }
  | { type: 'toolcall'; name: string; arguments: unknown }
  | { type: 'toolresult'; name: string; text: string }
  | { type: 'thinking'; thinking: string }
