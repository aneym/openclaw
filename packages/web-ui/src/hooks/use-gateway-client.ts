import { useCallback, useEffect, useRef, useState } from 'react'
import {
  GatewayBrowserClient,
  type GatewayEventFrame,
  type GatewayHelloOk,
} from '@/lib/gateway/client'

const SETTINGS_KEY = 'openclaw.web-ui.settings.v1'

interface UseGatewayClientOptions {
  url?: string
  token?: string
  password?: string
}

type EventListener = (evt: GatewayEventFrame) => void

/**
 * Reads auth from URL params (?token=, ?password=, ?url=),
 * persists token to localStorage, strips params from URL.
 */
function resolveAuthFromUrl(): { token?: string; password?: string; url?: string } {
  const params = new URLSearchParams(window.location.search)
  const result: { token?: string; password?: string; url?: string } = {}
  let shouldClean = false

  const tokenRaw = params.get('token')
  if (tokenRaw != null) {
    const token = tokenRaw.trim()
    if (token) {
      result.token = token
      // Persist token to localStorage
      try {
        const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
        stored.token = token
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(stored))
      } catch { /* ignore */ }
    }
    params.delete('token')
    shouldClean = true
  }

  const passwordRaw = params.get('password')
  if (passwordRaw != null) {
    const password = passwordRaw.trim()
    if (password) result.password = password
    params.delete('password')
    shouldClean = true
  }

  const urlRaw = params.get('url')
  if (urlRaw != null) {
    const url = urlRaw.trim()
    if (url) result.url = url
    params.delete('url')
    shouldClean = true
  }

  // Clean URL params after extraction
  if (shouldClean) {
    const cleanUrl = new URL(window.location.href)
    cleanUrl.search = params.toString()
    window.history.replaceState({}, '', cleanUrl.toString())
  }

  return result
}

function loadStoredToken(): string | undefined {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    const token = stored.token
    return typeof token === 'string' && token.trim() ? token : undefined
  } catch {
    return undefined
  }
}

// Resolve once at module load to avoid re-reading cleaned URL
const urlAuth = resolveAuthFromUrl()

export function useGatewayClient(
  opts?: UseGatewayClientOptions,
) {
  const [connected, setConnected] = useState(false)
  const [hello, setHello] = useState<GatewayHelloOk | null>(null)
  const [error, setError] = useState<string | null>(null)
  const clientRef = useRef<GatewayBrowserClient | null>(null)
  const listenersRef = useRef<Set<EventListener>>(new Set())

  const addEventListener = useCallback((fn: EventListener) => {
    listenersRef.current.add(fn)
    return () => {
      listenersRef.current.delete(fn)
    }
  }, [])

  useEffect(() => {
    // Priority: explicit opts > URL params > localStorage
    const token = opts?.token ?? urlAuth.token ?? loadStoredToken()
    const password = opts?.password ?? urlAuth.password
    const wsUrl = opts?.url ?? urlAuth.url ?? deriveWebSocketUrl()

    const client = new GatewayBrowserClient({
      url: wsUrl,
      token,
      password,
      clientName: 'webchat-ui',
      mode: 'webchat',
      onHello: (h) => {
        setHello(h)
        setConnected(true)
        setError(null)
      },
      onEvent: (evt) => {
        for (const listener of listenersRef.current) {
          try {
            listener(evt)
          } catch (err) {
            console.error('[gateway] event listener error:', err)
          }
        }
      },
      onClose: ({ code, reason }) => {
        setConnected(false)
        if (code === 4008) {
          setError(`Connection failed: ${reason || 'auth rejected'}`)
        }
      },
    })

    clientRef.current = client
    client.start()

    return () => {
      client.stop()
      clientRef.current = null
      setConnected(false)
      setHello(null)
    }
  }, [opts?.url, opts?.token, opts?.password])

  return {
    client: clientRef.current,
    connected,
    hello,
    error,
    addEventListener,
  }
}

function deriveWebSocketUrl(): string {
  if (import.meta.env.DEV) {
    return `ws://${window.location.hostname}:18789`
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}`
}
