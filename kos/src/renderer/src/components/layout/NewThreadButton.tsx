import { Plus } from "lucide-react";
import { useCreateThread } from "../../hooks/use-create-thread";
import { Button } from "../ui/button";

export function NewThreadButton() {
  const { createThread, canCreate } = useCreateThread();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={createThread}
      disabled={!canCreate}
      className="w-full justify-start gap-2.5 hover:bg-accent/50 transition-all duration-200 font-medium"
    >
      <Plus className="h-4 w-4 shrink-0" />
      <span>New Chat</span>
    </Button>
  );
}
