import { Activity, Circle, Zap } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useStreaming } from "../../hooks/use-streaming";
import { useGatewayStore } from "../../stores/gateway-store";
import { useThreadStore } from "../../stores/thread-store";
import { useWorkspaceStore } from "../../stores/workspace-store";

interface AgentEventPayload {
  runId: string;
  sessionKey?: string;
  stream: "lifecycle" | "tool" | "assistant" | "error" | string;
  ts: number;
  data: {
    model?: string;
    provider?: string;
    agentId?: string;
    phase?: string;
  };
}

export function StatusBar() {
  const connected = useGatewayStore((s) => s.connected);
  const error = useGatewayStore((s) => s.error);
  const subscribe = useGatewayStore((s) => s.subscribe);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const activeThreadId = useThreadStore((s) => s.activeThreadId);
  // Select raw Map to avoid calling method in selector (causes infinite loops)
  const threadsMap = useThreadStore((s) => s.threads);

  // Derive activeThread outside selector with useMemo
  const activeThread = useMemo(
    () => (activeThreadId ? threadsMap.get(activeThreadId) : null),
    [threadsMap, activeThreadId],
  );
  const { isStreaming, runId } = useStreaming(activeThread?.sessionKey ?? "");

  // Track current model and agent from events
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeThread?.sessionKey) {
      return;
    }

    // Subscribe to agent events to track model/agent info and run lifecycle
    const unsubscribe = subscribe("agent", (payload: unknown) => {
      const agentPayload = payload as AgentEventPayload;

      if (agentPayload.sessionKey !== activeThread.sessionKey) {
        return;
      }

      // Handle lifecycle events
      if (agentPayload.stream === "lifecycle") {
        const phase = agentPayload.data?.phase;
        // Run starting - capture model/agent info
        if (phase === "start") {
          if (agentPayload.data?.model) {
            const provider = agentPayload.data.provider ?? "";
            const model = agentPayload.data.model;
            const displayModel = provider ? `${provider}/${model}` : model;
            setCurrentModel(displayModel);
          }
          if (agentPayload.data?.agentId) {
            setCurrentAgentId(agentPayload.data.agentId);
          }
        }
        // Run ended - clear model/agent info
        if (phase === "end" || phase === "error") {
          setCurrentModel(null);
          setCurrentAgentId(null);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [activeThread?.sessionKey, subscribe]);

  // Reset model/agent when thread changes
  useEffect(() => {
    if (!activeThread) {
      setCurrentModel(null);
      setCurrentAgentId(null);
    }
  }, [activeThread?.id]);

  const statusColor = connected ? "bg-green-500" : error ? "bg-red-500" : "bg-yellow-500";
  const statusText = connected ? "Connected" : error ? "Disconnected" : "Connecting...";

  return (
    <div className="h-6 border-t border-border bg-muted/50 px-3 flex items-center justify-between text-xs text-muted-foreground">
      {/* Left: Connection status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className={cn("w-2 h-2 rounded-full", statusColor)} />
          <span>{statusText}</span>
        </div>

        {/* Active thread streaming status */}
        {activeThread && (
          <div className="flex items-center gap-1.5">
            {isStreaming ? (
              <>
                <Activity className="w-3 h-3 text-blue-500 animate-pulse" />
                <span className="text-blue-500">Streaming</span>
              </>
            ) : (
              <>
                <Circle className="w-2 h-2 fill-current" />
                <span>Idle</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Right: Session info */}
      <div className="flex items-center gap-3">
        {/* Model info */}
        {currentModel && (
          <div className="flex items-center gap-1.5">
            <Zap className="w-3 h-3" />
            <span className="font-mono">{currentModel}</span>
          </div>
        )}

        {/* Agent ID (if different from default) */}
        {currentAgentId && currentAgentId !== "main" && (
          <div className="flex items-center gap-1.5">
            <span className="opacity-60">Agent:</span>
            <span className="font-mono">{currentAgentId}</span>
          </div>
        )}

        {/* Run ID */}
        {runId && (
          <div className="flex items-center gap-1.5">
            <span className="opacity-60">Run:</span>
            <span className="font-mono text-[10px]">{runId.slice(0, 8)}</span>
          </div>
        )}

        {/* Workspace */}
        {activeWorkspace && (
          <div className="flex items-center gap-1.5 border-l border-border pl-3">
            <span>{activeWorkspace.icon || "🏠"}</span>
            <span>{activeWorkspace.name}</span>
          </div>
        )}
      </div>
    </div>
  );
}
