import { Activity, Circle, Zap } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { Chat, Project, Workspace } from "../../types";
import { useStreaming } from "../../hooks/use-streaming";
import { ProjectIcon } from "../../lib/project-icons";
import { useChatStore } from "../../stores/chat-store";
import { useGatewayStore } from "../../stores/gateway-store";
import { useProjectStore } from "../../stores/project-store";
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

  // Project state
  const projectsMap = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  // Workspace state
  const workspacesMap = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceByProject = useWorkspaceStore((s) => s.activeWorkspaceByProject);

  // Chat state
  const chatsMap = useChatStore((s) => s.chats);
  const activeChatByWorkspace = useChatStore((s) => s.activeChatByWorkspace);

  // Derive active project
  const activeProject = useMemo(
    () => (activeProjectId ? (projectsMap.get(activeProjectId) as Project | undefined) : undefined),
    [projectsMap, activeProjectId],
  );

  // Derive active workspace
  const activeWorkspaceId = useMemo(() => {
    if (!activeProjectId) return undefined;
    return activeWorkspaceByProject.get(activeProjectId);
  }, [activeProjectId, activeWorkspaceByProject]);

  const activeWorkspace = useMemo(
    () =>
      activeWorkspaceId
        ? (workspacesMap.get(activeWorkspaceId) as Workspace | undefined)
        : undefined,
    [workspacesMap, activeWorkspaceId],
  );

  // Derive active chat
  const activeChatId = useMemo(() => {
    if (!activeWorkspaceId) return undefined;
    return activeChatByWorkspace.get(activeWorkspaceId);
  }, [activeWorkspaceId, activeChatByWorkspace]);

  const activeChat = useMemo(
    () => (activeChatId ? (chatsMap.get(activeChatId) as Chat | undefined) : undefined),
    [chatsMap, activeChatId],
  );

  const { isStreaming, runId } = useStreaming(activeChat?.sessionKey ?? "");

  // Track current model and agent from events
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeChat?.sessionKey) {
      return;
    }

    // Subscribe to agent events to track model/agent info and run lifecycle
    const unsubscribe = subscribe("agent", (payload: unknown) => {
      const agentPayload = payload as AgentEventPayload;

      if (agentPayload.sessionKey !== activeChat.sessionKey) {
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
  }, [activeChat?.sessionKey, subscribe]);

  // Reset model/agent when chat changes
  useEffect(() => {
    if (!activeChat) {
      setCurrentModel(null);
      setCurrentAgentId(null);
    }
  }, [activeChat?.id]);

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

        {/* Active chat streaming status */}
        {activeChat && (
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

        {/* Project + Workspace */}
        {activeProject && (
          <div className="flex items-center gap-1.5 border-l border-border pl-3">
            <ProjectIcon icon={activeProject.icon} size="sm" />
            <span>{activeProject.name}</span>
            {activeWorkspace && activeWorkspace.name !== "main" && (
              <span className="text-muted-foreground/60">/ {activeWorkspace.name}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
