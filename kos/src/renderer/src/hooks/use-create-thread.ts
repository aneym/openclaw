import { useCallback } from "react";
import type { Thread } from "../types";
import { useGatewayStore } from "../stores/gateway-store";
import { usePanelStore } from "../stores/panel-store";
import { useTabStore } from "../stores/tab-store";
import { useThreadStore } from "../stores/thread-store";
import { useWorkspaceStore } from "../stores/workspace-store";

function generateThreadId(): string {
  return "thread-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9);
}

function generateSessionKey(): string {
  return "kos-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9);
}

export function useCreateThread() {
  const request = useGatewayStore((s) => s.request);
  const connected = useGatewayStore((s) => s.connected);
  const addThread = useThreadStore((s) => s.addThread);
  const setActiveThread = useThreadStore((s) => s.setActiveThread);
  const resetLayout = usePanelStore((s) => s.resetLayout);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspace?.id);
  const workspaceConfigId = useWorkspaceStore((s) => s.config.activeWorkspaceId);
  const resolvedWorkspaceId = activeWorkspaceId ?? workspaceConfigId ?? "default";
  const activeTabIdByWorkspace = useTabStore((s) => s.activeTabIdByWorkspace);
  const setTabActiveThread = useTabStore((s) => s.setActiveThread);
  const homeTabId = `home-${resolvedWorkspaceId}`;
  const activeTabId = activeTabIdByWorkspace[resolvedWorkspaceId] ?? homeTabId;

  const createThread = useCallback(async () => {
    if (!connected) {
      return null;
    }

    const threadId = generateThreadId();
    const sessionKey = generateSessionKey();
    const now = Date.now();

    try {
      // Use sessions.patch to create a new session entry
      await request("sessions.patch", {
        key: sessionKey,
        label: null,
      });

      // Create thread object
      const newThread: Thread = {
        id: threadId,
        tabId: activeTabId,
        sessionKey,
        title: "New Chat",
        status: "idle",
        lastMessageAt: now,
        createdAt: now,
      };

      // Add to store
      addThread(newThread);

      // Reset panel layout for new thread
      resetLayout(threadId);

      // Activate the thread
      setActiveThread(threadId);
      setTabActiveThread(activeTabId, threadId);

      return newThread;
    } catch (err) {
      console.error("[useCreateThread] Failed to create session:", err);
      return null;
    }
  }, [
    connected,
    request,
    activeTabId,
    addThread,
    resetLayout,
    setActiveThread,
    setTabActiveThread,
  ]);

  return { createThread, canCreate: connected };
}
