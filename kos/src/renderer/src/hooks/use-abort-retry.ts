/**
 * useAbortRetry hook — retries pending aborts after reconnection.
 *
 * When the gateway reconnects, check for any pending abort requests
 * and retry them automatically.
 */

import { useEffect, useRef } from "react";
import { klog } from "../lib/klog";
import { useAbortStore } from "../stores/abort-store";
import { useGatewayStore } from "../stores/gateway-store";

/**
 * Hook that monitors connection state and retries pending aborts.
 * Should be used once at the app level.
 */
export function useAbortRetry() {
  const connected = useGatewayStore((s) => s.connected);
  const request = useGatewayStore((s) => s.request);
  const { getPendingKeys, clearPending } = useAbortStore();
  const wasConnectedRef = useRef(false);

  useEffect(() => {
    // Detect reconnection (was disconnected, now connected)
    const wasDisconnected = !wasConnectedRef.current;
    wasConnectedRef.current = connected;

    if (!connected || !wasDisconnected) return;

    // Get pending abort keys
    const pendingKeys = getPendingKeys();
    if (pendingKeys.length === 0) return;

    klog.gateway(`Retrying ${pendingKeys.length} pending abort(s) after reconnect`);

    // Retry each pending abort
    for (const sessionKey of pendingKeys) {
      void (async () => {
        try {
          await request("chat.abort", { sessionKey });
          klog.gateway(`Abort retry successful for ${sessionKey.slice(0, 8)}...`);
          clearPending(sessionKey);
        } catch (err) {
          klog.gatewayError(`Abort retry failed for ${sessionKey.slice(0, 8)}...`, err);
          // Keep pending - will retry on next reconnect
        }
      })();
    }
  }, [connected, request, getPendingKeys, clearPending]);
}
