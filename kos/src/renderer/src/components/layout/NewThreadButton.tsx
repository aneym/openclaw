import { Plus } from "lucide-react";
import type { Thread } from "../../types";
import { useGatewayStore } from "../../stores/gateway-store";
import { usePanelStore } from "../../stores/panel-store";
import { useThreadStore } from "../../stores/thread-store";
import { Button } from "../ui/button";

function generateThreadId(): string {
  return "thread-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9);
}

function generateSessionKey(): string {
  // Generate a unique session key like "kos-{timestamp}-{random}"
  return "kos-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9);
}

export function NewThreadButton() {
  const request = useGatewayStore((s) => s.request);
  const connected = useGatewayStore((s) => s.connected);
  const addThread = useThreadStore((s) => s.addThread);
  const setActiveThread = useThreadStore((s) => s.setActiveThread);
  const resetLayout = usePanelStore((s) => s.resetLayout);

  const handleNewThread = async () => {
    if (!connected) {
      return;
    }

    const threadId = generateThreadId();
    const sessionKey = generateSessionKey();
    const now = Date.now();

    // Create the session via gateway RPC
    try {
      // Use sessions.patch to create a new session entry
      await request("sessions.patch", {
        key: sessionKey,
        label: null,
      });

      // Create thread object
      const newThread: Thread = {
        id: threadId,
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
    } catch (err) {
      console.error("[NewThreadButton] Failed to create session:", err);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleNewThread}
      disabled={!connected}
      className="w-full justify-start gap-2.5 hover:bg-accent/50 transition-all duration-200 font-medium"
    >
      <Plus className="h-4 w-4 shrink-0" />
      <span>New Chat</span>
    </Button>
  );
}
