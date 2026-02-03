import { useCallback, useEffect, useRef, useState } from 'react'
import { useGateway } from './use-gateway'
import type {
  ChatEventPayload,
  ChatHistoryResult,
  ChatMessage,
  ChatStatusResult,
  ContentBlock,
} from './gateway-types'

export interface UseChat {
  messages: ChatMessage[]
  streamText: string | null
  isStreaming: boolean
  runId: string | null
  loading: boolean
  send: (text: string) => void
  abort: () => void
  refresh: () => void
}

function extractText(content: string | ContentBlock[] | undefined): string {
  if (!content) {return ''}
  if (typeof content === 'string') {return content}
  const textBlock = content.find(
    (b): b is { type: 'text'; text: string } => b.type === 'text',
  )
  return textBlock?.text ?? ''
}

/**
 * Chat hook scoped to a specific session key.
 * Each thread passes its own sessionKey for independent chat state.
 */
export function useChat(sessionKey: string): UseChat {
  const { client, state } = useGateway()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streamText, setStreamText] = useState<string | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const sessionKeyRef = useRef(sessionKey)
  const runIdRef = useRef(runId)
  sessionKeyRef.current = sessionKey
  runIdRef.current = runId

  const refresh = useCallback(() => {
    if (!client || state !== 'connected' || !sessionKey) {return}
    setLoading(true)
    client
      .request<ChatHistoryResult>('chat.history', { sessionKey, limit: 200 })
      .then((res) => {
        if (sessionKeyRef.current !== sessionKey) {return}
        setMessages(Array.isArray(res.messages) ? res.messages : [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [client, state, sessionKey])

  const send = useCallback(
    (text: string) => {
      if (!client || state !== 'connected' || !sessionKey) {return}
      const trimmed = text.trim()
      if (!trimmed) {return}

      const userMsg: ChatMessage = {
        role: 'user',
        content: trimmed,
        ts: Date.now(),
      }
      setMessages((prev) => [...prev, userMsg])

      const idempotencyKey = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      client
        .request('chat.send', {
          sessionKey,
          message: trimmed,
          thinking: 'default',
          idempotencyKey,
        })
        .catch((err) => {
          console.error('[chat] send failed:', err)
        })
    },
    [client, state, sessionKey],
  )

  const abort = useCallback(() => {
    if (!client || state !== 'connected' || !sessionKey) {return}
    client
      .request('chat.abort', {
        sessionKey,
        runId: runIdRef.current ?? undefined,
      })
      .catch(() => {})
  }, [client, state, sessionKey])

  // Subscribe to chat events filtered by sessionKey
  useEffect(() => {
    if (!client) {return}

    const refreshRef = { current: refresh }
    refreshRef.current = refresh

    return client.onEvent((evt) => {
      if (evt.event !== 'chat') {return}
      const payload = evt.payload as ChatEventPayload | undefined
      if (!payload || payload.sessionKey !== sessionKeyRef.current) {return}

      if (payload.state === 'delta') {
        if (payload.runId && !runIdRef.current) {
          setRunId(payload.runId)
          runIdRef.current = payload.runId
        }
        const text = payload.message ? extractText(payload.message.content) : null
        if (text) {setStreamText(text)}
      } else if (
        payload.state === 'final' ||
        payload.state === 'error' ||
        payload.state === 'aborted'
      ) {
        setRunId(null)
        runIdRef.current = null
        setStreamText(null)
        if (payload.state === 'final') {
          setTimeout(() => refreshRef.current(), 100)
        }
      }
    })
  }, [client, refresh])

  // Reset state and load history when sessionKey changes
  useEffect(() => {
    setMessages([])
    setStreamText(null)
    setRunId(null)
    runIdRef.current = null

    if (state !== 'connected' || !sessionKey || !client) {return}
    refresh()
    client
      .request<ChatStatusResult>('chat.status', { sessionKey })
      .then((res) => {
        if (sessionKeyRef.current !== sessionKey) {return}
        if (res?.activeRun?.runId) {
          setRunId(res.activeRun.runId)
          if (res.activeRun.streamText) {setStreamText(res.activeRun.streamText)}
        }
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey, state])

  return {
    messages,
    streamText,
    isStreaming: runId !== null || streamText !== null,
    runId,
    loading,
    send,
    abort,
    refresh,
  }
}
