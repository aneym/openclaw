// Gateway WebSocket protocol types (subset needed for Expo client).
// Derived from src/gateway/protocol/schema/ — kept minimal to avoid
// TypeBox / ESM bundler issues.

export interface GatewayEventFrame {
  type: 'event'
  event: string
  payload?: unknown
  seq?: number
  stateVersion?: { presence: number; health: number }
}

export interface GatewayResponseFrame {
  type: 'res'
  id: string
  ok: boolean
  payload?: unknown
  error?: { code: string; message: string; details?: unknown }
}

export interface GatewayHelloOk {
  type: 'hello-ok'
  protocol: number
  features?: { methods?: string[]; events?: string[] }
  snapshot?: {
    presence?: unknown[]
    health?: unknown
    sessionDefaults?: SessionDefaults
  }
  auth?: {
    deviceToken?: string
    role?: string
    scopes?: string[]
    issuedAtMs?: number
  }
  policy?: { tickIntervalMs?: number }
}

export interface SessionDefaults {
  defaultAgentId?: string
  mainKey?: string
  mainSessionKey?: string
  scope?: string
}

// Chat types

export interface ChatHistoryParams {
  sessionKey: string
  limit?: number
}

export interface ChatHistoryResult {
  messages: ChatMessage[]
  thinkingLevel?: string | null
}

export interface ChatSendParams {
  sessionKey: string
  message: string
  thinking?: string
  idempotencyKey: string
}

export interface ChatAbortParams {
  sessionKey: string
  runId?: string
}

export interface ChatStatusResult {
  activeRun?: {
    runId: string
    streamText?: string | null
  } | null
}

export type ChatEventState = 'delta' | 'final' | 'aborted' | 'error'

export interface ChatEventPayload {
  runId: string
  sessionKey: string
  seq: number
  state: ChatEventState
  message?: ChatMessage | null
  errorMessage?: string
  usage?: { inputTokens?: number; outputTokens?: number }
  stopReason?: string
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string | ContentBlock[]
  ts?: number
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: unknown }

// Sessions

export interface SessionEntry {
  key: string
  label?: string
  displayName?: string
  icon?: string
  kind?: string
  updatedAt?: number | null
  archivedAt?: number
  lastMessagePreview?: string
  channel?: string
  derivedTitle?: string
}

export interface SessionsListResult {
  sessions: SessionEntry[]
}

// Connect params sent to "connect" method

export interface ConnectParams {
  minProtocol: number
  maxProtocol: number
  client: {
    id: string
    version: string
    platform: string
    mode: string
    instanceId?: string
  }
  role: string
  scopes: string[]
  caps: string[]
  auth?: {
    token?: string
    password?: string
  }
}
