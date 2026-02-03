export type GatewayEventFrame = {
  type: 'event'
  event: string
  payload?: unknown
  seq?: number
  stateVersion?: { presence: number; health: number }
}

export type GatewayResponseFrame = {
  type: 'res'
  id: string
  ok: boolean
  payload?: unknown
  error?: { code: string; message: string; details?: unknown }
}

export type GatewayHelloOk = {
  type: 'hello-ok'
  protocol: number
  features?: { methods?: string[]; events?: string[] }
  snapshot?: unknown
  auth?: {
    deviceToken?: string
    role?: string
    scopes?: string[]
    issuedAtMs?: number
  }
  policy?: { tickIntervalMs?: number }
}

export type GatewayRequestFrame = {
  type: 'req'
  id: string
  method: string
  params?: unknown
}

type Pending = {
  resolve: (value: unknown) => void
  reject: (err: unknown) => void
}

export type { Pending }

export type GatewayClientOptions = {
  url: string
  token?: string
  onHello?: (hello: GatewayHelloOk) => void
  onEvent?: (evt: GatewayEventFrame) => void
  onClose?: (info: { code: number; reason: string }) => void
  onGap?: (info: { expected: number; received: number }) => void
  onReconnect?: () => void
}
