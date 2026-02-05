import { Home, Plus, Settings as SettingsIcon, ScrollText, Check } from "lucide-react";
import { useState } from "react";
import type { Project } from "../../types";
import { getLogsAsText } from "../../lib/log-buffer";
import { ProjectIcon } from "../../lib/project-icons";
import { cn } from "../../lib/utils";
import { ProfileSwitcher } from "./ProfileSwitcher";

export const HOME_PROJECT_ID = "__home__";

interface ProjectTabsProps {
  projects: Project[];
  activeProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onSettings: () => void;
  onCreateProject: () => void;
  onProjectSettings?: (projectId: string) => void;
  onOpenProfileSettings?: () => void;
  onCreateProfile?: () => void;
}

export function ProjectTabs({
  projects,
  activeProjectId,
  onSelectProject,
  onSettings,
  onCreateProject,
  onOpenProfileSettings,
  onCreateProfile,
}: ProjectTabsProps) {
  const isHomeActive = activeProjectId === HOME_PROJECT_ID;
  const [logsCopied, setLogsCopied] = useState(false);

  const handleCopyLogs = async () => {
    // Get renderer logs (all captured console output + uncaught errors)
    const rendererLogs = getLogsAsText();

    // Export to file for agent access (only if preload loaded successfully)
    if (window.api?.logs) {
      try {
        const result = await window.api.logs.exportToFile(rendererLogs);
        if (result.success) {
          console.log(`[logs] Exported to ${result.path}`);
        }
      } catch (err) {
        console.error("Failed to export logs to file:", err);
      }
    }

    // Get main process logs for clipboard (only if preload loaded)
    let mainLogs = "";
    if (window.api?.logs) {
      try {
        mainLogs = await window.api.logs.getMainLogs();
      } catch (err) {
        console.error("Failed to get main process logs:", err);
      }
    } else {
      mainLogs = "(unavailable — preload script failed to load)";
    }

    // Combine for clipboard
    const combined = `${rendererLogs}

${"=".repeat(50)}
=== Main Process Logs ===
${"=".repeat(50)}

${mainLogs}`;

    try {
      await navigator.clipboard.writeText(combined);
      setLogsCopied(true);
      setTimeout(() => setLogsCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy logs:", err);
    }
  };

  return (
    <div
      className="flex items-center h-10 border-b border-border/50 px-2 gap-1 [-webkit-app-region:drag]"
      style={{ background: "var(--glass-chrome-bg)" }}
    >
      <div className="flex items-center gap-1 [-webkit-app-region:no-drag]">
        {/* Home tab */}
        <button
          onClick={() => onSelectProject(HOME_PROJECT_ID)}
          className={cn(
            "px-3 py-1.5 rounded-md text-sm transition-all",
            "flex items-center gap-2 relative",
            isHomeActive
              ? "bg-background text-foreground shadow-md font-semibold border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-background/50 font-medium",
          )}
        >
          <Home className="h-4 w-4" />
          <span>Home</span>
        </button>

        {/* Project tabs */}
        {projects.map((project) => (
          <button
            key={project.id}
            onClick={() => onSelectProject(project.id)}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm transition-all",
              "flex items-center gap-2 relative",
              project.id === activeProjectId
                ? "bg-background text-foreground shadow-md font-semibold border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50 font-medium",
            )}
          >
            <ProjectIcon icon={project.icon} size="sm" />
            <span>{project.name}</span>
          </button>
        ))}
        <button
          onClick={onCreateProject}
          className={cn(
            "px-2 py-1.5 rounded-md text-muted-foreground",
            "hover:text-foreground hover:bg-background/50 transition-colors",
          )}
          title="Add project"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-1 [-webkit-app-region:no-drag]">
        <ProfileSwitcher onOpenSettings={onOpenProfileSettings} onCreateProfile={onCreateProfile} />
        <button
          onClick={handleCopyLogs}
          className={cn(
            "px-2 py-1.5 rounded-md text-muted-foreground",
            "hover:text-foreground hover:bg-background/50 transition-colors",
            logsCopied && "text-green-500",
          )}
          title="Copy console logs"
        >
          {logsCopied ? <Check className="h-4 w-4" /> : <ScrollText className="h-4 w-4" />}
        </button>
        <button
          onClick={onSettings}
          className={cn(
            "px-2 py-1.5 rounded-md text-muted-foreground",
            "hover:text-foreground hover:bg-background/50 transition-colors",
          )}
          title="Settings"
        >
          <SettingsIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
