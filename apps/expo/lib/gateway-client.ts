import type {
  ConnectParams,
  GatewayEventFrame,
  GatewayHelloOk,
  GatewayResponseFrame,
} from './gateway-types'

type Pending = {
  resolve: (value: unknown) => void
  reject: (err: unknown) => void
}

export interface GatewayClientOptions {
  url: string
  token?: string
  password?: string
  onHello?: (hello: GatewayHelloOk) => void
  onEvent?: (evt: GatewayEventFrame) => void
  onClose?: (info: { code: number; reason: string }) => void
}

const CONNECT_FAILED_CLOSE_CODE = 4008

/**
 * Lightweight WebSocket client for the OpenClaw gateway.
 * Mirrors the browser client in ui/src/ui/gateway.ts but without
 * device identity / crypto.subtle (not available in React Native).
 */
export class GatewayClient {
  private ws: WebSocket | null = null
  private pending = new Map<string, Pending>()
  private closed = false
  private lastSeq: number | null = null
  private connectNonce: string | null = null
  private connectSent = false
  private connectTimer: ReturnType<typeof setTimeout> | null = null
  private backoffMs = 800
  private eventListeners = new Set<(evt: GatewayEventFrame) => void>()

  constructor(private opts: GatewayClientOptions) {}

  /** Subscribe to all gateway events. Returns an unsubscribe function. */
  onEvent(listener: (evt: GatewayEventFrame) => void): () => void {
    this.eventListeners.add(listener)
    return () => { this.eventListeners.delete(listener) }
  }

  start() {
    this.closed = false
    this.connect()
  }

  stop() {
    this.closed = true
    this.ws?.close()
    this.ws = null
    this.flushPending(new Error('gateway client stopped'))
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('gateway not connected'))
    }
    const id = generateId()
    const frame = { type: 'req', id, method, params }
    const p = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (v) => resolve(v as T), reject })
    })
    this.ws.send(JSON.stringify(frame))
    return p
  }

  // --- private ---

  private connect() {
    if (this.closed) return
    this.ws = new WebSocket(this.opts.url)
    this.ws.onopen = () => this.queueConnect()
    this.ws.onmessage = (ev) => this.handleMessage(String(ev.data ?? ''))
    this.ws.onclose = (ev) => {
      const reason = String((ev as { reason?: string }).reason ?? '')
      this.ws = null
      this.flushPending(new Error(`gateway closed (${ev.code}): ${reason}`))
      this.opts.onClose?.({ code: ev.code, reason })
      this.scheduleReconnect()
    }
    this.ws.onerror = () => {
      // close handler will fire
    }
  }

  private scheduleReconnect() {
    if (this.closed) return
    const delay = this.backoffMs
    this.backoffMs = Math.min(this.backoffMs * 1.7, 15_000)
    setTimeout(() => this.connect(), delay)
  }

  private flushPending(err: Error) {
    for (const [, p] of this.pending) p.reject(err)
    this.pending.clear()
  }

  private queueConnect() {
    this.connectNonce = null
    this.connectSent = false
    if (this.connectTimer !== null) clearTimeout(this.connectTimer)
    // Wait briefly for challenge event, then connect anyway
    this.connectTimer = setTimeout(() => {
      void this.sendConnect()
    }, 750)
  }

  private sendConnect() {
    if (this.connectSent) return
    this.connectSent = true
    if (this.connectTimer !== null) {
      clearTimeout(this.connectTimer)
      this.connectTimer = null
    }

    const auth =
      this.opts.token || this.opts.password
        ? { token: this.opts.token, password: this.opts.password }
        : undefined

    const params: ConnectParams = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: 'openclaw-ios',
        version: '0.0.1',
        platform: 'expo',
        mode: 'webchat',
      },
      role: 'operator',
      scopes: ['operator.admin'],
      caps: [],
      auth,
    }

    void this.request<GatewayHelloOk>('connect', params)
      .then((hello) => {
        this.backoffMs = 800
        this.opts.onHello?.(hello)
      })
      .catch(() => {
        this.ws?.close(CONNECT_FAILED_CLOSE_CODE, 'connect failed')
      })
  }

  private handleMessage(raw: string) {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }

    const frame = parsed as { type?: unknown }

    if (frame.type === 'event') {
      const evt = parsed as GatewayEventFrame
      if (evt.event === 'connect.challenge') {
        const payload = evt.payload as { nonce?: unknown } | undefined
        const nonce = payload && typeof payload.nonce === 'string' ? payload.nonce : null
        if (nonce) {
          this.connectNonce = nonce
          void this.sendConnect()
        }
        return
      }
      const seq = typeof evt.seq === 'number' ? evt.seq : null
      if (seq !== null) {
        this.lastSeq = seq
      }
      try {
        this.opts.onEvent?.(evt)
        for (const listener of this.eventListeners) listener(evt)
      } catch (err) {
        console.error('[gateway] event handler error:', err)
      }
      return
    }

    if (frame.type === 'res') {
      const res = parsed as GatewayResponseFrame
      const pending = this.pending.get(res.id)
      if (!pending) return
      this.pending.delete(res.id)
      if (res.ok) pending.resolve(res.payload)
      else pending.reject(new Error(res.error?.message ?? 'request failed'))
    }
  }
}

// Simple ID generator (no crypto.randomUUID in RN)
let idCounter = 0
function generateId(): string {
  return `${Date.now().toString(36)}-${(idCounter++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
