import { useEffect } from "react";
import type { Agent } from "../stores/agent-store";
import { klog } from "../lib/klog";
import { useAgentStore } from "../stores/agent-store";
import { useGatewayStore } from "../stores/gateway-store";

interface AgentsListResult {
  defaultId?: string;
  agents?: Array<{
    id: string;
    name?: string;
    identity?: {
      name?: string;
      emoji?: string;
      avatar?: string;
      avatarUrl?: string;
    };
  }>;
}

interface AgentIdentityResult {
  agentId: string;
  name: string;
  avatar?: string;
  emoji?: string;
}

function toAgent(raw: NonNullable<AgentsListResult["agents"]>[number]): Agent {
  return {
    id: raw.id,
    name: raw.identity?.name || raw.name || raw.id,
    emoji: raw.identity?.emoji,
    avatar: raw.identity?.avatar,
    avatarUrl: raw.identity?.avatarUrl,
  };
}

/**
 * Fetches agent list and current agent identity on gateway connect.
 * Stores results in the agent store for use by filter pills, avatars, etc.
 */
export function useAgentSync() {
  const connected = useGatewayStore((s) => s.connected);
  const request = useGatewayStore((s) => s.request);
  const setAgents = useAgentStore((s) => s.setAgents);
  const setCurrentAgent = useAgentStore((s) => s.setCurrentAgent);

  useEffect(() => {
    if (!connected) {
      return;
    }

    let cancelled = false;

    // Fetch both in parallel
    const agentsPromise = request<AgentsListResult>("agents.list", {});
    const identityPromise = request<AgentIdentityResult>("agent.identity.get", {});

    Promise.all([agentsPromise, identityPromise])
      .then(([agentsResult, identityResult]) => {
        if (cancelled) {
          return;
        }

        // Process agents list
        const agents = (agentsResult?.agents ?? []).map(toAgent);
        setAgents(agents);
        klog.gateway("agents loaded", { count: agents.length });

        // Process current agent identity
        if (identityResult?.agentId) {
          setCurrentAgent({
            id: identityResult.agentId,
            name: identityResult.name,
            avatar: identityResult.avatar,
            emoji: identityResult.emoji,
          });
          klog.gateway("current agent identity", {
            agentId: identityResult.agentId,
            name: identityResult.name,
          });
        }
      })
      .catch((err) => {
        // Non-fatal — agent UI will just not show filter pills
        console.warn("[useAgentSync] Failed to fetch agents:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [connected, request, setAgents, setCurrentAgent]);
}
