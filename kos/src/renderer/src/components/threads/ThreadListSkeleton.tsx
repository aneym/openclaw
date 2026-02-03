import { Loader2 } from "lucide-react";

export function ThreadListSkeleton() {
  return (
    <div className="px-4 pb-4 space-y-0.5">
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-0.5">
          <div className="flex items-center gap-3 rounded-lg bg-muted/20 h-12 px-3">
            <Loader2 className="h-4 w-4 shrink-0 text-muted-foreground animate-spin" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-32 rounded bg-muted/40" />
              <div className="h-3 w-48 rounded bg-muted/40" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
