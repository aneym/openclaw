import { createContext, useContext, useMemo } from 'react'
import { useGatewayClient } from '@/hooks/use-gateway-client'
import type { GatewayBrowserClient, GatewayEventFrame, GatewayHelloOk } from '@/lib/gateway/client'

interface GatewayContextValue {
  client: GatewayBrowserClient | null
  connected: boolean
  hello: GatewayHelloOk | null
  error: string | null
  addEventListener: (fn: (evt: GatewayEventFrame) => void) => () => void
}

const GatewayContext = createContext<GatewayContextValue | null>(null)

interface GatewayProviderProps {
  children: React.ReactNode
  url?: string
  token?: string
  password?: string
}

export function GatewayProvider({ children, url, token, password }: GatewayProviderProps) {
  const gateway = useGatewayClient({ url, token, password })

  const value = useMemo(
    () => ({
      client: gateway.client,
      connected: gateway.connected,
      hello: gateway.hello,
      error: gateway.error,
      addEventListener: gateway.addEventListener,
    }),
    [gateway.client, gateway.connected, gateway.hello, gateway.error, gateway.addEventListener],
  )

  return <GatewayContext value={value}>{children}</GatewayContext>
}

export function useGateway(): GatewayContextValue {
  const ctx = useContext(GatewayContext)
  if (!ctx) throw new Error('useGateway must be used within a GatewayProvider')
  return ctx
}
