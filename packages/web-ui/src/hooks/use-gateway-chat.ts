import { useCallback, useEffect, useRef, useState } from 'react'
import { useGateway } from '@/providers/gateway-provider'
import type {
  ChatEventPayload,
  AgentEventPayload,
  ToolStreamEntry,
} from '@/lib/gateway/types'

function generateId(): string {
  return crypto.randomUUID()
}

function extractText(message: unknown): string | null {
  const m = message as Record<string, unknown>
  const content = m.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const parts = content
      .map((p) => {
        const item = p as Record<string, unknown>
        if (item.type === 'text' && typeof item.text === 'string') return item.text
        return null
      })
      .filter((v): v is string => typeof v === 'string')
    if (parts.length > 0) return parts.join('\n')
  }
  if (typeof m.text === 'string') return m.text
  return null
}

function formatToolOutput(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  const record = value as Record<string, unknown>
  if (typeof record.text === 'string') return record.text
  const content = record.content
  if (Array.isArray(content)) {
    const parts = content
      .map((item) => {
        const entry = item as Record<string, unknown>
        if (entry.type === 'text' && typeof entry.text === 'string') return entry.text
        return null
      })
      .filter((p): p is string => Boolean(p))
    if (parts.length > 0) return parts.join('\n')
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export interface UseGatewayChatOptions {
  sessionKey: string
}

export interface UseGatewayChatReturn {
  messages: unknown[]
  streamingContent: string | null
  sending: boolean
  loading: boolean
  runId: string | null
  error: string | null
  toolCalls: ToolStreamEntry[]
  sendMessage: (text: string) => Promise<boolean>
  abort: () => Promise<void>
  loadHistory: () => Promise<void>
}

export function useGatewayChat({ sessionKey }: UseGatewayChatOptions): UseGatewayChatReturn {
  const { client, connected, addEventListener } = useGateway()
  const [messages, setMessages] = useState<unknown[]>([])
  const [streamingContent, setStreamingContent] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toolCalls, setToolCalls] = useState<ToolStreamEntry[]>([])
  const toolStreamRef = useRef<Map<string, ToolStreamEntry>>(new Map())
  const toolOrderRef = useRef<string[]>([])
  const sessionKeyRef = useRef(sessionKey)
  sessionKeyRef.current = sessionKey
  const runIdRef = useRef<string | null>(null)

  // Load chat history
  const loadHistory = useCallback(async () => {
    if (!client || !connected) return
    setLoading(true)
    setError(null)
    try {
      const res = (await client.request('chat.history', {
        sessionKey,
        limit: 200,
      })) as { messages?: unknown[] }
      setMessages(Array.isArray(res.messages) ? res.messages : [])
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [client, connected, sessionKey])

  // Send a message
  const sendMessage = useCallback(
    async (text: string): Promise<boolean> => {
      if (!client || !connected) return false
      const msg = text.trim()
      if (!msg) return false

      const now = Date.now()
      const idempotencyKey = generateId()

      // Optimistic user message
      setMessages((prev) => [
        ...prev,
        {
          role: 'user',
          content: [{ type: 'text', text: msg }],
          timestamp: now,
        },
      ])

      setSending(true)
      setError(null)
      setRunId(idempotencyKey)
      runIdRef.current = idempotencyKey
      setStreamingContent('')
      // Reset tool calls for new run
      toolStreamRef.current.clear()
      toolOrderRef.current = []
      setToolCalls([])

      try {
        await client.request('chat.send', {
          sessionKey,
          message: msg,
          deliver: false,
          idempotencyKey,
        })
        return true
      } catch (err) {
        const errStr = String(err)
        setRunId(null)
        runIdRef.current = null
        setStreamingContent(null)
        setError(errStr)
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Error: ' + errStr }],
            timestamp: Date.now(),
          },
        ])
        return false
      } finally {
        setSending(false)
      }
    },
    [client, connected, sessionKey],
  )

  // Abort current run
  const abort = useCallback(async () => {
    if (!client || !connected) return
    const currentRunId = runIdRef.current
    try {
      await client.request(
        'chat.abort',
        currentRunId
          ? { sessionKey, runId: currentRunId }
          : { sessionKey },
      )
    } catch (err) {
      setError(String(err))
    }
  }, [client, connected, sessionKey])

  // Subscribe to gateway events
  useEffect(() => {
    const unsub = addEventListener((evt) => {
      if (evt.event === 'chat') {
        const payload = evt.payload as ChatEventPayload | undefined
        if (!payload) return
        if (payload.sessionKey !== sessionKeyRef.current) return

        if (payload.state === 'delta') {
          const text = extractText(payload.message)
          if (typeof text === 'string') {
            setStreamingContent((prev) => {
              if (!prev || text.length >= prev.length) return text
              return prev
            })
          }
        } else if (payload.state === 'final') {
          setStreamingContent(null)
          setRunId(null)
          runIdRef.current = null
          // Reload history to get the final message
          loadHistory()
        } else if (payload.state === 'aborted') {
          setStreamingContent(null)
          setRunId(null)
          runIdRef.current = null
          loadHistory()
        } else if (payload.state === 'error') {
          setStreamingContent(null)
          setRunId(null)
          runIdRef.current = null
          setError(payload.errorMessage ?? 'chat error')
          loadHistory()
        }
      }

      if (evt.event === 'agent') {
        const payload = evt.payload as AgentEventPayload | undefined
        if (!payload) return
        if (payload.stream !== 'tool') return

        const eventSessionKey =
          typeof payload.sessionKey === 'string' ? payload.sessionKey : undefined
        if (eventSessionKey && eventSessionKey !== sessionKeyRef.current) return
        if (runIdRef.current && payload.runId !== runIdRef.current) return
        if (!runIdRef.current) return

        const data = payload.data ?? {}
        const toolCallId = typeof data.toolCallId === 'string' ? data.toolCallId : ''
        if (!toolCallId) return
        const name = typeof data.name === 'string' ? data.name : 'tool'
        const phase = typeof data.phase === 'string' ? data.phase : ''
        const args = phase === 'start' ? data.args : undefined
        const output =
          phase === 'update'
            ? formatToolOutput(data.partialResult)
            : phase === 'result'
              ? formatToolOutput(data.result)
              : undefined

        const now = Date.now()
        const existing = toolStreamRef.current.get(toolCallId)
        if (!existing) {
          const entry: ToolStreamEntry = {
            toolCallId,
            runId: payload.runId,
            sessionKey: eventSessionKey,
            name,
            args,
            output: output ?? undefined,
            startedAt: typeof payload.ts === 'number' ? payload.ts : now,
            updatedAt: now,
            phase: phase as ToolStreamEntry['phase'],
          }
          toolStreamRef.current.set(toolCallId, entry)
          toolOrderRef.current.push(toolCallId)
        } else {
          existing.name = name
          if (args !== undefined) existing.args = args
          if (output !== undefined) existing.output = output
          existing.updatedAt = now
          existing.phase = phase as ToolStreamEntry['phase']
        }

        // Update state
        const ordered = toolOrderRef.current
          .map((id) => toolStreamRef.current.get(id))
          .filter((e): e is ToolStreamEntry => Boolean(e))
        setToolCalls([...ordered])
      }
    })

    return unsub
  }, [addEventListener, loadHistory])

  // Load history on session change
  useEffect(() => {
    if (connected && sessionKey) {
      loadHistory()
    }
  }, [connected, sessionKey, loadHistory])

  // Reset state on session change
  useEffect(() => {
    setStreamingContent(null)
    setRunId(null)
    runIdRef.current = null
    setError(null)
    toolStreamRef.current.clear()
    toolOrderRef.current = []
    setToolCalls([])
  }, [sessionKey])

  return {
    messages,
    streamingContent,
    sending,
    loading,
    runId,
    error,
    toolCalls,
    sendMessage,
    abort,
    loadHistory,
  }
}
