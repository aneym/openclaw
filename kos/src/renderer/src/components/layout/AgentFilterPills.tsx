import { memo, useCallback } from "react";
import type { Agent } from "../../stores/agent-store";
import { cn } from "../../lib/utils";
import { useAgentStore } from "../../stores/agent-store";
import { AgentAvatar } from "./AgentAvatar";

interface AgentFilterPillsProps {
  className?: string;
  /** Controlled value — selected agent ID (null = "All"). Falls back to global store if omitted. */
  value?: string | null;
  /** Controlled onChange. Falls back to global store if omitted. */
  onChange?: (agentId: string | null) => void;
}

export const AgentFilterPills = memo(function AgentFilterPills({
  className,
  value,
  onChange,
}: AgentFilterPillsProps) {
  const agents = useAgentStore((s) => s.agents);
  const storeFilter = useAgentStore((s) => s.agentFilter);
  const setStoreFilter = useAgentStore((s) => s.setAgentFilter);

  // Support both controlled (value/onChange) and uncontrolled (global store) modes
  const activeFilter = value !== undefined ? value : storeFilter;
  const setFilter = onChange ?? setStoreFilter;

  // Only render when there are 2+ agents
  if (agents.length < 2) {
    return null;
  }

  return (
    <div className={cn("flex items-center gap-1.5 overflow-x-auto scrollbar-none", className)}>
      <FilterPill label="All" isActive={activeFilter === null} onClick={() => setFilter(null)} />
      {agents.map((agent) => (
        <AgentPill
          key={agent.id}
          agent={agent}
          isActive={activeFilter === agent.id}
          onSelect={setFilter}
        />
      ))}
    </div>
  );
});

interface FilterPillProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
}

const FilterPill = memo(function FilterPill({ label, isActive, onClick }: FilterPillProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
        isActive
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:text-foreground hover:bg-accent",
      )}
    >
      {label}
    </button>
  );
});

interface AgentPillProps {
  agent: Agent;
  isActive: boolean;
  onSelect: (id: string) => void;
}

const AgentPill = memo(function AgentPill({ agent, isActive, onSelect }: AgentPillProps) {
  const handleClick = useCallback(() => {
    onSelect(agent.id);
  }, [agent.id, onSelect]);

  return (
    <button
      onClick={handleClick}
      className={cn(
        "shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full",
        "text-xs font-medium transition-colors",
        isActive
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:text-foreground hover:bg-accent",
      )}
    >
      <AgentAvatar agent={agent} size="sm" className="h-4 w-4 text-[8px]" />
      <span className="truncate max-w-[80px]">{agent.name}</span>
    </button>
  );
});
