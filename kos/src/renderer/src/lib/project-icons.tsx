import type { ComponentProps } from "react";
import { Folder, FolderOpen, Inbox, Rocket, type LucideIcon } from "lucide-react";
import { cn } from "./utils";

/**
 * Map of known icon names to Lucide components.
 * Projects can set icon to one of these keys for a consistent icon.
 */
const iconMap: Record<string, LucideIcon> = {
  folder: Folder,
  "folder-open": FolderOpen,
  inbox: Inbox,
  rocket: Rocket,
};

interface ProjectIconProps extends Omit<ComponentProps<"span">, "children"> {
  /** Icon identifier - can be a known key, emoji string, or undefined */
  icon?: string | null;
  /** Size class for Lucide icons */
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

/**
 * Renders a project icon - either a Lucide icon or emoji fallback.
 * Falls back to Folder icon if no icon is specified.
 */
export function ProjectIcon({ icon, size = "md", className, ...props }: ProjectIconProps) {
  // Check if it's a known Lucide icon key
  if (icon && icon in iconMap) {
    const Icon = iconMap[icon];
    return (
      <Icon
        className={cn(sizeClasses[size], className)}
        {...(props as ComponentProps<typeof Icon>)}
      />
    );
  }

  // If it's an emoji or other string, render as text
  if (icon) {
    return (
      <span className={cn("inline-flex items-center justify-center", className)} {...props}>
        {icon}
      </span>
    );
  }

  // Default to Folder icon
  return (
    <Folder
      className={cn(sizeClasses[size], className)}
      {...(props as ComponentProps<typeof Folder>)}
    />
  );
}
