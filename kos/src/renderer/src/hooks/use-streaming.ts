import { useState, useEffect } from 'react'
import { useGatewayStore } from '../stores/gateway-store'

export interface StreamingState {
  isStreaming: boolean
  streamText: string
  runId: string | null
}

interface AgentEventPayload {
  runId: string
  sessionKey?: string
  stream: string
  ts: number
  data: Record<string, unknown>
}

/**
 * Track streaming state for a session.
 * Subscribes to agent.event gateway events and tracks the stream field.
 *
 * @param sessionKey - The session key to track
 * @returns Streaming state (isStreaming, streamText, runId)
 */
export function useStreaming(sessionKey: string): StreamingState {
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [runId, setRunId] = useState<string | null>(null)
  const subscribe = useGatewayStore((s) => s.subscribe)

  useEffect(() => {
    if (!sessionKey) {
      return
    }

    // Subscribe to agent.event for this session
    const unsubscribe = subscribe('agent.event', (payload: unknown) => {
      const agentPayload = payload as AgentEventPayload

      // Only handle events for our session
      if (agentPayload.sessionKey !== sessionKey) {
        return
      }

      const stream = agentPayload.stream ?? ''
      const currentRunId = agentPayload.runId

      // Detect streaming state changes
      // If stream is non-empty, we're streaming
      if (stream.length > 0) {
        setIsStreaming(true)
        setRunId(currentRunId)
        setStreamText(stream)
      } else {
        // Empty stream means streaming ended
        setIsStreaming((prev) => {
          if (prev) {
            setStreamText('')
            setRunId(null)
          }
          return false
        })
      }
    })

    // Subscribe to run lifecycle events for more robust streaming detection
    const unsubscribeRunStart = subscribe('run.start', (payload: unknown) => {
      const p = payload as { sessionKey?: string; runId: string }
      if (p.sessionKey === sessionKey) {
        setIsStreaming(true)
        setRunId(p.runId)
        setStreamText('')
      }
    })

    const unsubscribeRunEnd = subscribe('run.end', (payload: unknown) => {
      const p = payload as { sessionKey?: string; runId: string }
      if (p.sessionKey === sessionKey) {
        setIsStreaming(false)
        setStreamText('')
        setRunId(null)
      }
    })

    return () => {
      unsubscribe()
      unsubscribeRunStart()
      unsubscribeRunEnd()
    }
  }, [sessionKey, subscribe])

  return { isStreaming, streamText, runId }
}
