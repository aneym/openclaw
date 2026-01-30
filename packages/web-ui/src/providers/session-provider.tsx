import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useGateway } from './gateway-provider'
import type { GatewaySessionRow, SessionsListResult } from '@/lib/gateway/types'

const DEFAULT_SESSION_KEY = 'webchat-ui'

interface SessionContextValue {
  sessionKey: string
  setSessionKey: (key: string) => void
  sessions: GatewaySessionRow[]
  sessionsLoading: boolean
  loadSessions: () => Promise<void>
  newSession: () => void
  deleteSession: (key: string) => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { client, connected } = useGateway()
  const [sessionKey, setSessionKey] = useState(DEFAULT_SESSION_KEY)
  const [sessions, setSessions] = useState<GatewaySessionRow[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)

  const loadSessions = useCallback(async () => {
    if (!client || !connected) return
    setSessionsLoading(true)
    try {
      const res = (await client.request('sessions.list', {
        limit: 50,
      })) as SessionsListResult | undefined
      if (res?.sessions) {
        setSessions(res.sessions)
      }
    } catch {
      // silently fail
    } finally {
      setSessionsLoading(false)
    }
  }, [client, connected])

  const newSession = useCallback(() => {
    const key = `webchat-${Date.now()}`
    setSessionKey(key)
  }, [])

  const deleteSession = useCallback(
    async (key: string) => {
      if (!client || !connected) return
      try {
        await client.request('sessions.delete', { key, deleteTranscript: true })
        await loadSessions()
        if (key === sessionKey) {
          setSessionKey(DEFAULT_SESSION_KEY)
        }
      } catch {
        // silently fail
      }
    },
    [client, connected, sessionKey, loadSessions],
  )

  // Load sessions on connect
  useEffect(() => {
    if (connected) {
      loadSessions()
    }
  }, [connected, loadSessions])

  return (
    <SessionContext
      value={{
        sessionKey,
        setSessionKey,
        sessions,
        sessionsLoading,
        loadSessions,
        newSession,
        deleteSession,
      }}
    >
      {children}
    </SessionContext>
  )
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within a SessionProvider')
  return ctx
}
