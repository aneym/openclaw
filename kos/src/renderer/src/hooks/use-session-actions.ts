import { useCallback, useState } from "react";
import { notifications } from "../lib/notifications";
import { useGatewayStore } from "../stores/gateway-store";
import { useThreadStore } from "../stores/thread-store";

interface SessionActionsState {
  isLoading: boolean;
  error: string | null;
}

export function useSessionActions(sessionKey: string, threadId: string) {
  const [state, setState] = useState<SessionActionsState>({
    isLoading: false,
    error: null,
  });

  const request = useGatewayStore((s) => s.request);
  const connected = useGatewayStore((s) => s.connected);
  const archiveThread = useThreadStore((s) => s.archiveThread);
  const unarchiveThread = useThreadStore((s) => s.unarchiveThread);

  const archive = useCallback(async () => {
    if (!connected) {
      notifications.error("Not connected", "Cannot archive session while disconnected");
      return false;
    }

    setState({ isLoading: true, error: null });

    try {
      await request("sessions.patch", { key: sessionKey, archived: true });
      archiveThread(threadId);
      notifications.sessionArchived(sessionKey);
      setState({ isLoading: false, error: null });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setState({ isLoading: false, error: message });
      notifications.rpcError("sessions.patch", message);
      return false;
    }
  }, [connected, request, sessionKey, threadId, archiveThread]);

  const unarchive = useCallback(async () => {
    if (!connected) {
      notifications.error("Not connected", "Cannot unarchive session while disconnected");
      return false;
    }

    setState({ isLoading: true, error: null });

    try {
      await request("sessions.patch", { key: sessionKey, archived: false });
      unarchiveThread(threadId);
      notifications.sessionUnarchived(sessionKey);
      setState({ isLoading: false, error: null });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setState({ isLoading: false, error: message });
      notifications.rpcError("sessions.patch", message);
      return false;
    }
  }, [connected, request, sessionKey, threadId, unarchiveThread]);

  const reload = useCallback(async () => {
    if (!connected) {
      notifications.error("Not connected", "Cannot reload session while disconnected");
      return false;
    }

    setState({ isLoading: true, error: null });

    try {
      await request("sessions.reset", { key: sessionKey });
      notifications.sessionReloaded();
      setState({ isLoading: false, error: null });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setState({ isLoading: false, error: message });
      notifications.rpcError("sessions.reset", message);
      return false;
    }
  }, [connected, request, sessionKey]);

  const copySessionKey = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(sessionKey);
      notifications.copied("Session ID");
      return true;
    } catch {
      notifications.error("Failed to copy", "Could not copy session ID to clipboard");
      return false;
    }
  }, [sessionKey]);

  return {
    ...state,
    connected,
    archive,
    unarchive,
    reload,
    copySessionKey,
  };
}
