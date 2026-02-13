import { create } from "zustand";
import type { GatewayEventFrame, GatewayHelloOk } from "../gateway/types";
import { GatewayClient } from "../gateway/client";
import { klog } from "../lib/klog";
import { notifications } from "../lib/notifications";
import { recoverAllChatSessions } from "./chat-session-store";

type EventHandler = (payload: unknown) => void;

// Vite HMR can replace modules without fully reloading the renderer process.
// Keep a global reference so a "new" store instance can stop any orphan
// GatewayClient created by the "old" store instance.
const GLOBAL_GATEWAY_CLIENT_KEY = "__kosGatewayClient";

function getGlobalGatewayClient(): GatewayClient | null {
  return (
    ((globalThis as unknown as Record<string, unknown>)[GLOBAL_GATEWAY_CLIENT_KEY] as
      | GatewayClient
      | undefined
      | null) ?? null
  );
}

function setGlobalGatewayClient(client: GatewayClient | null): void {
  (globalThis as unknown as Record<string, unknown>)[GLOBAL_GATEWAY_CLIENT_KEY] = client;
}

// ── Sub-agent types ──────────────────────────────────────────────
export interface SubagentRunInfo {
  runId: string;
  childSessionKey: string;
  requesterSessionKey: string;
  task: string;
  label?: string;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  outcome?: { status: "ok" | "error"; error?: string };
}

export interface SubagentEventPayload {
  phase: "start" | "end" | "error";
  runId: string;
  requesterSessionKey: string;
  childSessionKey: string;
  task: string;
  label?: string;
  startedAt?: number;
  endedAt?: number;
  outcome?: { status: "ok" | "error"; error?: string };
}

// ── Approval types ───────────────────────────────────────────────
export interface ExecApprovalRequestPayload {
  command: string;
  cwd?: string | null;
  host?: string | null;
  security?: string | null;
  ask?: string | null;
  agentId?: string | null;
  resolvedPath?: string | null;
  sessionKey?: string | null;
}

export interface ExecApprovalRequest {
  id: string;
  request: ExecApprovalRequestPayload;
  createdAtMs: number;
  expiresAtMs: number;
}

export interface ToolApprovalRequestPayload {
  toolName: string;
  toolInput: Record<string, unknown>;
  agentId?: string | null;
  sessionKey?: string | null;
}

export interface ToolApprovalRequest {
  id: string;
  request: ToolApprovalRequestPayload;
  createdAtMs: number;
  expiresAtMs: number;
}

interface GatewayState {
  client: GatewayClient | null;
  connected: boolean;
  error: string | null;
  hello: GatewayHelloOk | null;
  eventHandlers: Map<string, Set<EventHandler>>;
  // Debug info
  currentUrl: string | null;
  hasToken: boolean;
  configSource: string | null;

  // Sub-agent runs keyed by requesterSessionKey
  subagentRuns: Map<string, SubagentRunInfo[]>;

  // Approval queues
  execApprovalQueue: ExecApprovalRequest[];
  toolApprovalQueue: ToolApprovalRequest[];

  connect: (url: string, token?: string, source?: string) => void;
  disconnect: () => void;
  request: <T>(method: string, params?: unknown) => Promise<T>;
  subscribe: (event: string, handler: EventHandler) => () => void;
  setSubagentRuns: (runs: Map<string, SubagentRunInfo[]>) => void;
  setExecApprovalQueue: (queue: ExecApprovalRequest[]) => void;
  setToolApprovalQueue: (queue: ToolApprovalRequest[]) => void;
}

export const useGatewayStore = create<GatewayState>((set, get) => ({
  client: null,
  connected: false,
  error: null,
  hello: null,
  eventHandlers: new Map(),
  currentUrl: null,
  hasToken: false,
  configSource: null,
  subagentRuns: new Map(),
  execApprovalQueue: [],
  toolApprovalQueue: [],

  connect: (url: string, token?: string, source?: string) => {
    // Track connection info for debugging
    set({ currentUrl: url, hasToken: Boolean(token), configSource: source ?? null });
    const { client: existingClient } = get();
    const globalClient = getGlobalGatewayClient();
    // If we have an orphan client from a previous HMR instance, stop it.
    if (globalClient && globalClient !== existingClient) {
      globalClient.stop();
      setGlobalGatewayClient(null);
    }
    if (existingClient) {
      existingClient.stop();
    }

    const client = new GatewayClient({
      url,
      token,
      onHello: (hello) => {
        const wasConnected = get().connected;
        set({ hello, connected: true, error: null });
        if (wasConnected) {
          notifications.connectionRestored();
          // Reconnect: recover all active chat sessions (restore stop button state)
          klog.gateway("reconnect detected, recovering chat sessions");
          void recoverAllChatSessions(get().request);
        }
      },
      onEvent: (evt: GatewayEventFrame) => {
        // Log all incoming events for debugging
        klog.gateway("event received", {
          event: evt.event,
          seq: evt.seq,
          payload: evt.payload,
        });

        const handlers = get().eventHandlers.get(evt.event);
        if (handlers) {
          klog.gateway(`dispatching to ${handlers.size} handler(s)`);
          handlers.forEach((handler) => {
            try {
              handler(evt.payload);
            } catch (err) {
              klog.gatewayError("event handler error:", err);
            }
          });
        } else {
          klog.gateway(`no handlers registered for event "${evt.event}"`);
        }
      },
      onClose: (info) => {
        const wasConnected = get().connected;
        set({ connected: false });
        if (info.code !== 1000) {
          const errorMsg = `Connection closed: ${info.reason}`;
          set({ error: errorMsg });
          if (wasConnected) {
            notifications.connectionLost();
          }
        }
      },
      onGap: (info) => {
        console.warn("[gateway] sequence gap detected:", info);
      },
      onReconnect: () => {
        console.log("[gateway] reconnecting...");
      },
    });

    client.start();
    setGlobalGatewayClient(client);
    set({ client, error: null });
  },

  disconnect: () => {
    const { client } = get();
    if (client) {
      client.stop();
      const globalClient = getGlobalGatewayClient();
      if (globalClient === client) {
        setGlobalGatewayClient(null);
      }
      set({ client: null, connected: false, hello: null });
    }
  },

  request: async <T>(method: string, params?: unknown): Promise<T> => {
    const { client } = get();
    if (!client) {
      throw new Error("Gateway not connected");
    }
    klog.gateway(`request: ${method}`, params);
    try {
      const result = await client.request<T>(method, params);
      klog.gateway(`response: ${method}`, result);
      return result;
    } catch (err) {
      klog.gatewayError(`request failed: ${method}`, err);
      throw err;
    }
  },

  subscribe: (event: string, handler: EventHandler) => {
    const { eventHandlers } = get();
    let handlers = eventHandlers.get(event);
    if (!handlers) {
      handlers = new Set();
      eventHandlers.set(event, handlers);
    }
    handlers.add(handler);

    // Return unsubscribe function
    return () => {
      const currentHandlers = get().eventHandlers.get(event);
      if (currentHandlers) {
        currentHandlers.delete(handler);
        if (currentHandlers.size === 0) {
          get().eventHandlers.delete(event);
        }
      }
    };
  },

  setSubagentRuns: (runs) => set({ subagentRuns: runs }),
  setExecApprovalQueue: (queue) => set({ execApprovalQueue: queue }),
  setToolApprovalQueue: (queue) => set({ toolApprovalQueue: queue }),
}));

// Best-effort cleanup on HMR dispose.
// (No-op in production builds; safe in Electron renderer.)
if (import.meta && "hot" in import.meta && (import.meta as unknown as { hot?: unknown }).hot) {
  (import.meta as unknown as { hot: { dispose: (cb: () => void) => void } }).hot.dispose(() => {
    try {
      useGatewayStore.getState().disconnect();
    } catch {
      // ignore
    }
  });
}
