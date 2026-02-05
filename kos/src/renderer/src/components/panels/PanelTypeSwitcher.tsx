/**
 * PanelTypeSwitcher
 *
 * Shown in empty panel states to allow switching to a different panel type
 * before content is assigned. Appears as a row of icon buttons.
 */

import {
  MessageSquare,
  Keyboard,
  Globe,
  ClipboardList,
  Eye,
  FileCode,
  Hammer,
  type LucideIcon,
} from "lucide-react";
import { memo, useCallback } from "react";
import type { PanelType } from "../../types";
import { cn } from "../../lib/utils";
import { usePanelStore } from "../../stores/panel-store";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

/** Panel types available for switching (excludes 'empty' which isn't user-selectable) */
const SWITCHABLE_PANEL_TYPES: { type: PanelType; icon: LucideIcon; label: string }[] = [
  { type: "chat", icon: MessageSquare, label: "Chat" },
  { type: "terminal", icon: Keyboard, label: "Terminal" },
  { type: "browser", icon: Globe, label: "Browser" },
  { type: "tasks", icon: ClipboardList, label: "Tasks" },
  { type: "preview", icon: Eye, label: "Preview" },
  { type: "code", icon: FileCode, label: "Code" },
  { type: "coding-session", icon: Hammer, label: "Coding Session" },
];

interface PanelTypeSwitcherProps {
  workspaceId: string;
  panelId: string;
  currentType: PanelType;
  className?: string;
}

export const PanelTypeSwitcher = memo(function PanelTypeSwitcher({
  workspaceId,
  panelId,
  currentType,
  className,
}: PanelTypeSwitcherProps) {
  const changePanelType = usePanelStore((s) => s.changePanelType);

  const handleTypeChange = useCallback(
    (newType: PanelType) => {
      if (newType !== currentType) {
        changePanelType(workspaceId, panelId, newType);
      }
    },
    [workspaceId, panelId, currentType, changePanelType],
  );

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <span className="text-xs text-muted-foreground/60 mr-1">Switch to:</span>
      {SWITCHABLE_PANEL_TYPES.filter((p) => p.type !== currentType).map(
        ({ type, icon: Icon, label }) => (
          <Tooltip key={type}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => handleTypeChange(type)}
              >
                <Icon className="h-4 w-4" />
                <span className="sr-only">{label}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{label}</TooltipContent>
          </Tooltip>
        ),
      )}
    </div>
  );
});
