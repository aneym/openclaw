import { create } from "zustand";

export interface Agent {
  id: string;
  name: string;
  emoji?: string;
  avatar?: string;
  avatarUrl?: string;
}

interface AgentState {
  agents: Agent[];
  currentAgent: Agent | null;
  agentFilter: string | null;

  setAgents: (agents: Agent[]) => void;
  setCurrentAgent: (agent: Agent | null) => void;
  setAgentFilter: (filter: string | null) => void;
}

export const useAgentStore = create<AgentState>((set) => ({
  agents: [],
  currentAgent: null,
  agentFilter: null,

  setAgents: (agents) => set({ agents }),
  setCurrentAgent: (agent) => set({ currentAgent: agent }),
  setAgentFilter: (filter) => set({ agentFilter: filter }),
}));
