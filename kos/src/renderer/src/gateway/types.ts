export type GatewayEventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: { presence: number; health: number };
};

export type GatewayResponseFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string; details?: unknown };
};

export type GatewayHelloOk = {
  type: "hello-ok";
  protocol: number;
  server?: {
    version: string;
    commit?: string;
    host?: string;
    connId: string;
  };
  features?: { methods?: string[]; events?: string[] };
  snapshot?: unknown;
  auth?: {
    deviceToken?: string;
    role?: string;
    scopes?: string[];
    issuedAtMs?: number;
  };
  policy?: { tickIntervalMs?: number; maxPayload?: number; maxBufferedBytes?: number };
};

export type GatewayRequestFrame = {
  type: "req";
  id: string;
  method: string;
  params?: unknown;
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
};

export type { Pending };

export type GatewayClientOptions = {
  url: string;
  token?: string;
  onHello?: (hello: GatewayHelloOk) => void;
  onEvent?: (evt: GatewayEventFrame) => void;
  onClose?: (info: { code: number; reason: string }) => void;
  onGap?: (info: { expected: number; received: number }) => void;
  onReconnect?: () => void;
};

// CDP message types for browser panel
export type GatewayCdpFrame = {
  type: "cdp";
  id: string;
  method: string;
  params?: object;
};

export type GatewayCdpResponseFrame = {
  type: "cdp-response";
  id: string;
  result?: unknown;
  error?: string;
};

// Browser info update - sent when browser panel state changes
export type GatewayBrowserInfoFrame = {
  type: "browser-info";
  cdpUrl: string | null;
  isActive: boolean;
};

// Terminal frames (gateway → kOS via node.invoke.request)
export type GatewayTerminalSpawnFrame = {
  type: "terminal-spawn";
  id: string;
  cwd?: string;
};

export type GatewayTerminalExecFrame = {
  type: "terminal-exec";
  id: string;
  terminalId: string;
  command: string;
  timeoutMs?: number;
};

export type GatewayTerminalReadFrame = {
  type: "terminal-read";
  id: string;
  terminalId: string;
  since?: number;
  maxBytes?: number;
};

export type GatewayTerminalCloseFrame = {
  type: "terminal-close";
  id: string;
  terminalId: string;
  force?: boolean;
};

export type GatewayTerminalListFrame = {
  type: "terminal-list";
  id: string;
};

// Terminal frames (kOS → gateway via node.invoke.result)
export type GatewayTerminalResponseFrame = {
  type: "terminal-response";
  id: string;
  result?: unknown;
  error?: string;
};

export type GatewayTerminalOutputFrame = {
  type: "terminal-output";
  terminalId: string;
  data: string;
  timestamp: number;
};
