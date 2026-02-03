import { useEffect, useState } from 'react';
import { useGatewayStore } from '../stores/gateway-store';

export function useGateway() {
  return useGatewayStore((s) => ({
    connected: s.connected,
    error: s.error,
    connect: s.connect,
    disconnect: s.disconnect,
    request: s.request,
  }));
}

export function useGatewayEvent(event: string, handler: (payload: unknown) => void) {
  const subscribe = useGatewayStore((s) => s.subscribe);

  useEffect(() => {
    const unsubscribe = subscribe(event, handler);
    return unsubscribe;
  }, [event, handler, subscribe]);
}

export function useSession(sessionKey: string) {
  const [messages, setMessages] = useState<unknown[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const subscribe = useGatewayStore((s) => s.subscribe);

  useEffect(() => {
    // Subscribe to session-specific events
    const unsubscribes = [
      subscribe('session.message', (payload: any) => {
        if (payload?.sessionKey === sessionKey) {
          setMessages((prev) => [...prev, payload]);
        }
      }),
      subscribe('session.stream.start', (payload: any) => {
        if (payload?.sessionKey === sessionKey) {
          setIsStreaming(true);
        }
      }),
      subscribe('session.stream.end', (payload: any) => {
        if (payload?.sessionKey === sessionKey) {
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
