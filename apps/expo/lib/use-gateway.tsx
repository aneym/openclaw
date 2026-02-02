import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { GatewayClient } from './gateway-client'
import type { GatewayHelloOk, SessionDefaults } from './gateway-types'
import { getSecureValue, loadSettings } from './storage'

export type ConnectionState = 'disconnected' | 'connecting' | 'connected'

interface GatewayContextValue {
  client: GatewayClient | null
  state: ConnectionState
  hello: GatewayHelloOk | null
  lastError: string | null
  sessionKey: string
  setSessionKey: (key: string) => void
  connect: (url: string, token?: string, password?: string) => void
  disconnect: () => void
}

const GatewayContext = createContext<GatewayContextValue>({
  client: null,
  state: 'disconnected',
  hello: null,
  lastError: null,
  sessionKey: '',
  setSessionKey: () => {},
  connect: () => {},
  disconnect: () => {},
})

export function useGateway() {
  return useContext(GatewayContext)
}

/**
 * Resolves session key aliases (e.g. "main") to the actual session key
 * from the hello snapshot's sessionDefaults.
 */
function resolveSessionKey(key: string, defaults?: SessionDefaults): string {
  if (!defaults?.mainSessionKey) {return key}
  const raw = (key ?? '').trim()
  if (!raw) {return defaults.mainSessionKey}
  const mainKey = defaults.mainKey?.trim() || 'main'
  const agentId = defaults.defaultAgentId?.trim()
  const isAlias =
    raw === 'main' ||
    raw === mainKey ||
    (agentId &&
      (raw === `agent:${agentId}:main` || raw === `agent:${agentId}:${mainKey}`))
  return isAlias ? defaults.mainSessionKey : raw
}

export function GatewayProvider({ children }: { children: ReactNode }) {
  const clientRef = useRef<GatewayClient | null>(null)
  const [state, setState] = useState<ConnectionState>('disconnected')
  const [hello, setHello] = useState<GatewayHelloOk | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [sessionKey, setSessionKeyRaw] = useState('')

  const setSessionKey = useCallback((key: string) => {
    setSessionKeyRaw(key)
  }, [])

  const disconnect = useCallback(() => {
    clientRef.current?.stop()
    clientRef.current = null
    setState('disconnected')
    setHello(null)
  }, [])

  const connect = useCallback(
    (url: string, token?: string, password?: string) => {
      disconnect()
      setState('connecting')
      setLastError(null)

      const client = new GatewayClient({
        url,
        token,
        password,
        onHello: (h) => {
          setState('connected')
          setLastError(null)
          setHello(h)
          const defaults = h.snapshot?.sessionDefaults
          setSessionKeyRaw((prev) => {
            const resolved = resolveSessionKey(prev, defaults)
            return resolved || defaults?.mainSessionKey || prev
          })
        },
        onClose: ({ code, reason }) => {
          setState('disconnected')
          if (code !== 1012) {
            setLastError(`Disconnected (${code}): ${reason || 'no reason'}`)
          }
        },
      })

      clientRef.current = client
      client.start()
    },
    [disconnect],
  )

  // Auto-connect on mount if we have saved settings
  useEffect(() => {
    const settings = loadSettings()
    if (!settings.gatewayUrl) {return}
    const token = getSecureValue('token') ?? undefined
    const password = getSecureValue('password') ?? undefined
    if (settings.sessionKey) {setSessionKeyRaw(settings.sessionKey)}
    connect(settings.gatewayUrl, token, password)
    return () => {
      clientRef.current?.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <GatewayContext.Provider
      value={{
        client: clientRef.current,
        state,
        hello,
        lastError,
        sessionKey,
        setSessionKey,
        connect,
        disconnect,
      }}
    >
      {children}
    </GatewayContext.Provider>
  )
}
