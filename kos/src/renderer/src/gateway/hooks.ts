import { useEffect, useRef, useState, useCallback } from 'react';
import { useGatewayStore } from '../stores/gateway-store';

/** Individual selectors to avoid object creation on every render */
export function useGatewayConnected() {
  return useGatewayStore((s) => s.connected);
}

export function useGatewayError() {
  return useGatewayStore((s) => s.error);
}

export function useGatewayConnect() {
  return useGatewayStore((s) => s.connect);
}

export function useGatewayDisconnect() {
  return useGatewayStore((s) => s.disconnect);
}

export function useGatewayRequest() {
  return useGatewayStore((s) => s.request);
}

export function useGatewayEvent(event: string, handler: (payload: unknown) => void) {
  const subscribe = useGatewayStore((s) => s.subscribe);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const stableHandler = (payload: unknown) => handlerRef.current(payload);
    const unsubscribe = subscribe(event, stableHandler);
    return unsubscribe;
  }, [event, subscribe]);
}

export function useSession(sessionKey: string) {
  const [messages, setMessages] = useState<unknown[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const subscribe = useGatewayStore((s) => s.subscribe);

  useEffect(() => {
    const unsubscribes = [
      subscribe('session.message', (payload: unknown) => {
        const p = payload as { sessionKey?: string };
        if (p?.sessionKey === sessionKey) {
          setMessages((prev) => [...prev, payload]);
        }
      }),
      subscribe('session.stream.start', (payload: unknown) => {
        const p = payload as { sessionKey?: string };
        if (p?.sessionKey === sessionKey) {
          setIsStreaming(true);
        }
      }),
      subscribe('session.stream.end', (payload: unknown) => {
        const p = payload as { sessionKey?: string };
        if (p?.sessionKey === sessionKey) {
          setIsStreaming(false);
        }
      }),
    ];

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [sessionKey, subscribe]);

  return { messages, isStreaming };
}
