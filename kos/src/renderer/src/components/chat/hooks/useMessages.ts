/**
 * useMessages hook — fetch message history and subscribe to new messages via gateway.
 */

import { useState, useEffect } from 'react'
import type { ChatMessage } from '../../../types/message'
import { normalizeMessage } from '../../../gateway/normalize'
import { useGatewayStore } from '../../../stores/gateway-store'

interface SessionHistoryResponse {
  messages: unknown[]
}

interface SessionMessageEvent {
  sessionKey: string
  message: unknown
}

export function useMessages(sessionKey: string, threadId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { request, subscribe } = useGatewayStore()

  // Fetch history on mount
  useEffect(() => {
    if (!sessionKey) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    request<SessionHistoryResponse>('session.history', { sessionKey, limit: 100 })
      .then((history) => {
        const normalized = history.messages.map((m) => normalizeMessage(m, threadId))
        setMessages(normalized)
        setLoading(false)
      })
      .catch((err) => {
        console.error('[useMessages] failed to fetch history:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch messages')
        setLoading(false)
      })
  }, [sessionKey, threadId, request])

  // Subscribe to new messages
  useEffect(() => {
    if (!sessionKey) {
      return
    }

    const unsubscribe = subscribe('session.message', (payload) => {
      const event = payload as SessionMessageEvent
      if (event.sessionKey === sessionKey) {
        const normalized = normalizeMessage(event.message, threadId)
        setMessages((prev) => [...prev, normalized])
      }
    })

    return unsubscribe
  }, [sessionKey, threadId, subscribe])

  return { messages, loading, error }
}
