import {
  Brain,
  Check,
  FlaskConical,
  Hammer,
  Search,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "../ui/badge";

export type CodingPhase = "exploring" | "planning" | "building" | "testing" | "complete" | "error";

interface PhaseIndicatorProps {
  phase: CodingPhase;
  className?: string;
}

/** Static icon map for phases */
const PHASE_ICONS: Record<CodingPhase, LucideIcon> = {
  exploring: Search,
  planning: Brain,
  building: Hammer,
  testing: FlaskConical,
  complete: Check,
  error: X,
};

/** Renders the appropriate icon for a coding phase */
function PhaseIcon({ phase, className }: { phase: CodingPhase; className?: string }) {
  const Icon = PHASE_ICONS[phase] || Wrench;
  return <Icon className={className} />;
}

function getPhaseColor(phase: CodingPhase): string {
  switch (phase) {
    case "exploring":
      return "text-blue-500 dark:text-blue-400";
    case "planning":
      return "text-purple-500 dark:text-purple-400";
    case "building":
      return "text-amber-500 dark:text-amber-400";
    case "testing":
      return "text-green-500 dark:text-green-400";
    case "complete":
      return "text-green-600 dark:text-green-500";
    case "error":
      return "text-red-500 dark:text-red-400";
    default:
      return "text-foreground";
  }
}

function getPhaseLabel(phase: CodingPhase): string {
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}

export function PhaseIndicator({ phase, className }: PhaseIndicatorProps) {
  const label = getPhaseLabel(phase);
  const color = getPhaseColor(phase);

  return (
    <Badge variant="outline" className={cn("gap-1.5", color, className)}>
      <PhaseIcon phase={phase} className="h-3.5 w-3.5" />
      <span className="font-medium">{label}</span>
    </Badge>
  );
}
