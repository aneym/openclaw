import { useCallback, useState } from "react";
import type { Chat } from "../types";
import { notifications } from "../lib/notifications";
import { useChatStore } from "../stores/chat-store";
import { useGatewayStore } from "../stores/gateway-store";
import { usePanelStore } from "../stores/panel-store";

interface SessionActionsState {
  isLoading: boolean;
  error: string | null;
}

export function useSessionActions(
  sessionKey: string,
  chatId: string,
  panelId: string,
  workspaceId: string,
) {
  const [state, setState] = useState<SessionActionsState>({
    isLoading: false,
    error: null,
  });

  const request = useGatewayStore((s) => s.request);
  const connected = useGatewayStore((s) => s.connected);
  const archiveChat = useChatStore((s) => s.archiveChat);
  const addChat = useChatStore((s) => s.addChat);
  const openThreadInPane = usePanelStore((s) => s.openThreadInPane);

  const archive = useCallback(async () => {
    if (!connected) {
      notifications.error("Not connected", "Cannot archive session while disconnected");
      return false;
    }

    setState({ isLoading: true, error: null });

    try {
      await request("sessions.patch", { key: sessionKey, archived: true });
      archiveChat(chatId);
      notifications.sessionArchived(sessionKey);
      setState({ isLoading: false, error: null });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setState({ isLoading: false, error: message });
      notifications.rpcError("sessions.patch", message);
      return false;
    }
  }, [connected, request, sessionKey, chatId, archiveChat]);

  const resetSession = useCallback(() => {
    const uuid = crypto.randomUUID();
    const newSessionKey = `kos:thread:${uuid}`;
    const now = Date.now();

    const newChat: Chat = {
      id: `chat-${now}`,
      workspaceId: workspaceId || undefined,
      sessionKey: newSessionKey,
      title: "New Chat",
      status: "active",
      lastMessageAt: now,
      createdAt: now,
    };

    addChat(newChat);
    openThreadInPane(workspaceId, panelId, newChat.id);
  }, [workspaceId, panelId, addChat, openThreadInPane]);

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
    resetSession,
    copySessionKey,
  };
}
