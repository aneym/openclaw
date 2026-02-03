import { create } from 'zustand'
import { GatewayClient } from '../gateway/client'
import type { GatewayEventFrame, GatewayHelloOk } from '../gateway/types'

type EventHandler = (payload: unknown) => void

interface GatewayState {
  client: GatewayClient | null
  connected: boolean
  error: string | null
  hello: GatewayHelloOk | null
  eventHandlers: Map<string, Set<EventHandler>>

  connect: (url: string, token?: string) => void
  disconnect: () => void
  request: <T>(method: string, params?: unknown) => Promise<T>
  subscribe: (event: string, handler: EventHandler) => () => void
}

export const useGatewayStore = create<GatewayState>((set, get) => ({
  client: null,
  connected: false,
  error: null,
  hello: null,
  eventHandlers: new Map(),

  connect: (url: string, token?: string) => {
    const { client: existingClient } = get()
    if (existingClient) {
      existingClient.stop()
    }

    const client = new GatewayClient({
      url,
      token,
      onHello: (hello) => {
        set({ hello, connected: true, error: null })
      },
      onEvent: (evt: GatewayEventFrame) => {
        const handlers = get().eventHandlers.get(evt.event)
        if (handlers) {
          handlers.forEach((handler) => {
            try {
              handler(evt.payload)
            } catch (err) {
              console.error('[gateway] event handler error:', err)
            }
          })
        }
      },
      onClose: (info) => {
        set({ connected: false })
        if (info.code !== 1000) {
          set({ error: `Connection closed: ${info.reason}` })
        }
      },
      onGap: (info) => {
        console.warn('[gateway] sequence gap detected:', info)
      },
      onReconnect: () => {
        console.log('[gateway] reconnecting...')
      }
    })

    client.start()
    set({ client, error: null })
  },

  disconnect: () => {
    const { client } = get()
    if (client) {
      client.stop()
      set({ client: null, connected: false, hello: null })
    }
  },

  request: async <T>(method: string, params?: unknown): Promise<T> => {
    const { client } = get()
    if (!client) {
      throw new Error('Gateway not connected')
    }
    return client.request<T>(method, params)
  },

  subscribe: (event: string, handler: EventHandler) => {
    const { eventHandlers } = get()
    let handlers = eventHandlers.get(event)
    if (!handlers) {
      handlers = new Set()
      eventHandlers.set(event, handlers)
    }
    handlers.add(handler)

    // Return unsubscribe function
    return () => {
      const currentHandlers = get().eventHandlers.get(event)
      if (currentHandlers) {
        currentHandlers.delete(handler)
        if (currentHandlers.size === 0) {
          get().eventHandlers.delete(event)
        }
      }
    }
  }
}))
