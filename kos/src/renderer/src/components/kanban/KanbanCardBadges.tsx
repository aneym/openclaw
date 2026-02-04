import { Ban, ArrowDownToLine } from "lucide-react";
import type { LinearRelation } from "../../types/linear";

interface KanbanCardBadgesProps {
  relations: LinearRelation[];
  downstreamCount?: number;
}

// Filter for active blockers (not Done/Canceled)
function getActiveBlockers(relations: LinearRelation[]): LinearRelation[] {
  return relations.filter((r) => {
    if (r.type !== "is_blocked_by") return false;
    const stateName = r.relatedIssue.state.name.toLowerCase();
    return !stateName.includes("done") && !stateName.includes("canceled");
  });
}

export function KanbanCardBadges({ relations, downstreamCount }: KanbanCardBadgesProps) {
  const blockers = getActiveBlockers(relations);

  if (blockers.length === 0 && (!downstreamCount || downstreamCount === 0)) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1 mt-2">
      {blockers.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-destructive">
          <Ban className="h-3 w-3 shrink-0" />
          <span className="truncate">
            Blocked by {blockers.map((b) => b.relatedIssue.identifier).join(", ")}
          </span>
        </div>
      )}
      {downstreamCount !== undefined && downstreamCount > 0 && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <ArrowDownToLine className="h-3 w-3 shrink-0" />
          <span>
            Blocks {downstreamCount} task{downstreamCount !== 1 ? "s" : ""}
          </span>
        </div>
      )}
    </div>
  );
}
