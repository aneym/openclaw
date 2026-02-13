import { memo, useState } from "react";
import type { Agent } from "../../stores/agent-store";
import { cn } from "../../lib/utils";

interface AgentAvatarProps {
  agent: Agent;
  size?: "sm" | "lg";
  className?: string;
}

const SIZES = {
  sm: "h-5 w-5 text-[10px]",
  lg: "h-8 w-8 text-sm",
} as const;

export const AgentAvatar = memo(function AgentAvatar({
  agent,
  size = "sm",
  className,
}: AgentAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const sizeClass = SIZES[size];

  // Priority: avatarUrl (image) -> emoji -> first letter
  if (agent.avatarUrl && !imgError) {
    return (
      <img
        src={agent.avatarUrl}
        alt={agent.name}
        onError={() => setImgError(true)}
        className={cn("rounded-full object-cover shrink-0", sizeClass, className)}
      />
    );
  }

  if (agent.emoji) {
    return (
      <span
        className={cn("shrink-0 flex items-center justify-center", sizeClass, className)}
        role="img"
        aria-label={agent.name}
      >
        {agent.emoji}
      </span>
    );
  }

  // Fallback: first letter of name
  const letter = agent.name.charAt(0).toUpperCase();
  return (
    <span
      className={cn(
        "shrink-0 flex items-center justify-center rounded-full",
        "bg-muted text-muted-foreground font-medium",
        sizeClass,
        className,
      )}
    >
      {letter}
    </span>
  );
});
