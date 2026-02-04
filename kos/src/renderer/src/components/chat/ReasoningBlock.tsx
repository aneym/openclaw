import { ChevronRight, Brain } from "lucide-react";
import { useState } from "react";
import { collapse } from "@/lib/animation-variants";
import { motion, AnimatePresence } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { TextPart } from "./TextPart";

interface ReasoningBlockProps {
  reasoning: string;
  durationMs?: number;
}

export function ReasoningBlock({ reasoning, durationMs }: ReasoningBlockProps) {
  const [open, setOpen] = useState(false);
  const durationStr = durationMs ? `${(durationMs / 1000).toFixed(1)}s` : "";

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
            className="mt-1 pl-4 border-l-2 border-accent text-sm text-muted-foreground"
          >
            <TextPart text={reasoning} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
