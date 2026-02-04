import { create } from "zustand";
import type { GatewayEventFrame, GatewayHelloOk } from "../gateway/types";
import { GatewayClient } from "../gateway/client";
import { klog } from "../lib/klog";
import { notifications } from "../lib/notifications";

type EventHandler = (payload: unknown) => void;

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

  connect: (url: string, token?: string, source?: string) => void;
  disconnect: () => void;
  request: <T>(method: string, params?: unknown) => Promise<T>;
  subscribe: (event: string, handler: EventHandler) => () => void;
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

  connect: (url: string, token?: string, source?: string) => {
    // Track connection info for debugging
    set({ currentUrl: url, hasToken: Boolean(token), configSource: source ?? null });
    const { client: existingClient } = get();
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
    set({ client, error: null });
  },

  disconnect: () => {
    const { client } = get();
    if (client) {
      client.stop();
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
}));
