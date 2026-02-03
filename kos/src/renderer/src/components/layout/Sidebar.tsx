import { MessageSquare, Settings } from "lucide-react";
import { ProjectList } from "../nav/ProjectList";
import { WorkspaceSwitcher } from "../nav/WorkspaceSwitcher";
import { NewThreadButton } from "./NewThreadButton";

type View = "home" | "settings";

interface SidebarProps {
  onNavigate: (view: View) => void;
  currentView: View;
}

export function Sidebar({ onNavigate, currentView }: SidebarProps) {
  return (
    <div className="h-full border-r border-border bg-muted/30 flex flex-col">
      {/* Header with macOS titlebar inset — drag region for window movement */}
      <div
        className="shrink-0 border-b border-border [-webkit-app-region:drag]"
        style={{ paddingTop: "var(--titlebar-height)" }}
      >
        <div className="h-12 px-3 flex items-center [-webkit-app-region:no-drag]">
          <WorkspaceSwitcher />
        </div>
      </div>

      {/* Nav */}
      <div className="px-3 py-2 space-y-0.5">
        <button
          onClick={() => onNavigate("home")}
          className={`w-full px-3 py-2 rounded-lg text-left text-sm transition-all duration-200 flex items-center gap-2.5 ${
            currentView === "home"
              ? "bg-accent text-accent-foreground shadow-sm"
              : "hover:bg-accent/50 text-muted-foreground hover:text-foreground"
          }`}
        >
          <MessageSquare className="h-4 w-4 shrink-0" />
          <span className="font-medium">Home</span>
        </button>
      </div>

      <div className="px-4 py-3 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
        Projects
      </div>

      <div className="px-3 pb-2">
        <NewThreadButton />
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-2">
        <ProjectList onThreadClick={() => onNavigate("home")} />
      </div>

      {/* Bottom nav - Settings */}
      <div className="border-t border-border px-3 py-2">
        <button
          onClick={() => onNavigate("settings")}
          className={`w-full px-3 py-2 rounded-lg text-left text-sm transition-all duration-200 flex items-center gap-2.5 ${
            currentView === "settings"
              ? "bg-accent text-accent-foreground shadow-sm"
              : "hover:bg-accent/50 text-muted-foreground hover:text-foreground"
          }`}
        >
          <Settings className="h-4 w-4 shrink-0" />
          <span className="font-medium">Settings</span>
        </button>
      </div>
    </div>
  );
}
