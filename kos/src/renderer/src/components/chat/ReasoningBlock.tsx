import { ChevronRight, Brain } from "lucide-react";
import { useMemo, useState } from "react";
import { collapse } from "@/lib/animation-variants";
import { motion, AnimatePresence } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { TextPart } from "./TextPart";

interface ReasoningEntry {
  reasoning: string;
  durationMs?: number;
}

interface ReasoningBlockProps {
  entries: ReasoningEntry[];
}

export function ReasoningBlock({ entries }: ReasoningBlockProps) {
  const [open, setOpen] = useState(false);

  const totalDurationMs = useMemo(
    () => entries.reduce((sum, e) => sum + (e.durationMs ?? 0), 0),
    [entries],
  );
  const durationStr = totalDurationMs > 0 ? `${(totalDurationMs / 1000).toFixed(1)}s` : "";

  if (entries.length === 0) return null;

  return (
    <div className="reasoning-block">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-1 py-0 rounded hover:bg-muted/50"
      >
        <Brain className="w-3.5 h-3.5 text-accent-foreground" />
        <span>
          {open ? "Hide reasoning" : `Thought${durationStr ? ` for ${durationStr}` : ""}...`}
        </span>
        <ChevronRight className={cn("w-3 h-3 transition-transform", open && "rotate-90")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            variants={collapse}
            initial="initial"
            animate="animate"
            exit="exit"
            className="mt-1 pl-4 border-l-2 border-accent text-sm text-muted-foreground space-y-2"
          >
            {entries.map((entry, idx) => (
              <TextPart key={idx} text={entry.reasoning} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
