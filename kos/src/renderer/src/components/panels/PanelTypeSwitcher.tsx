/**
 * PanelTypeSwitcher
 *
 * Shown in empty panel states to allow switching to a different panel type
 * before content is assigned. Appears as a row of icon buttons.
 * Uses USER_PANEL_TYPES from panel.ts as the single source of truth.
 */

import { memo, useCallback } from "react";
import type { PanelType } from "../../types";
import { cn } from "../../lib/utils";
import { usePanelStore } from "../../stores/panel-store";
import { USER_PANEL_TYPES, PANEL_TYPE_LABELS } from "../../types/panel";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { PanelTypeIcon } from "./PanelTabBar";

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
      {USER_PANEL_TYPES.filter((t) => t !== currentType).map((type) => (
        <Tooltip key={type}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => handleTypeChange(type)}
            >
              <PanelTypeIcon type={type} className="h-4 w-4" />
              <span className="sr-only">{PANEL_TYPE_LABELS[type]}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{PANEL_TYPE_LABELS[type]}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
});
