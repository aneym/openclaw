import { AlertCircle, type LucideIcon } from "lucide-react";
import type { PanelType } from "../../types";
import { usePanelStore } from "../../stores/panel-store";
import { Button } from "../ui/button";

interface UnsupportedPanelPaneProps {
  workspaceId: string;
  panelId: string;
  title: string;
  message: string;
  icon?: LucideIcon;
  suggestedType?: PanelType;
  suggestedActionLabel?: string;
}

export function UnsupportedPanelPane({
  workspaceId,
  panelId,
  title,
  message,
  icon: Icon = AlertCircle,
  suggestedType,
  suggestedActionLabel,
}: UnsupportedPanelPaneProps) {
  const changePanelType = usePanelStore((s) => s.changePanelType);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col items-center justify-center bg-background text-muted-foreground px-6 text-center gap-3">
        <Icon className="h-10 w-10 text-muted-foreground/50" />
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground max-w-sm">{message}</p>
        {suggestedType && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => changePanelType(workspaceId, panelId, suggestedType)}
          >
            {suggestedActionLabel ?? "Switch Panel"}
          </Button>
        )}
      </div>
    </div>
  );
}
