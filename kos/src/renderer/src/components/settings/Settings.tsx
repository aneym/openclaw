import { Bell, Eye, Link2, Palette, Plug, Users } from "lucide-react";
import { useState } from "react";
import { ThemeShowcase } from "../ThemeShowcase";
import { AppearanceSettings } from "./AppearanceSettings";
import { ConnectionSettings } from "./ConnectionSettings";
import { GitHubSettings } from "./GitHubSettings";
import { LinearSettings } from "./LinearSettings";
import { NotificationSettings } from "./NotificationSettings";
import { ProfileSettings } from "./ProfileSettings";

type SettingsSection =
  | "profiles"
  | "appearance"
  | "notifications"
  | "preview"
  | "connection"
  | "integrations";

const sections = [
  { id: "profiles" as const, label: "Profiles", icon: Users },
  { id: "appearance" as const, label: "Appearance", icon: Palette },
  { id: "notifications" as const, label: "Notifications", icon: Bell },
  { id: "integrations" as const, label: "Integrations", icon: Link2 },
  { id: "connection" as const, label: "Connection", icon: Plug },
  { id: "preview" as const, label: "Preview", icon: Eye },
];

export function Settings() {
  const [activeSection, setActiveSection] = useState<SettingsSection>("profiles");

  return (
    <div className="flex h-full">
      {/* Settings sidebar nav */}
      <div className="w-48 border-r border-border p-4 flex-shrink-0">
        <h2 className="text-lg font-semibold mb-4">Settings</h2>
        <nav className="space-y-1">
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                activeSection === id
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Settings content */}
      <div className="flex-1 overflow-hidden">
        {activeSection === "profiles" && (
          <div className="overflow-y-auto h-full p-8 max-w-2xl">
            <h2 className="text-2xl font-bold mb-6">Profiles</h2>
            <ProfileSettings />
          </div>
        )}
        {activeSection === "appearance" && (
          <div className="overflow-y-auto h-full p-8 max-w-2xl">
            <h2 className="text-2xl font-bold mb-6">Appearance</h2>
            <AppearanceSettings />
          </div>
        )}
        {activeSection === "notifications" && (
          <div className="overflow-y-auto h-full p-8 max-w-2xl">
            <h2 className="text-2xl font-bold mb-6">Notifications</h2>
            <NotificationSettings />
          </div>
        )}
        {activeSection === "integrations" && (
          <div className="overflow-y-auto h-full p-8 max-w-2xl">
            <h2 className="text-2xl font-bold mb-6">Integrations</h2>
            <div className="space-y-8">
              <GitHubSettings />
              <div className="border-t border-border" />
              <LinearSettings />
            </div>
          </div>
        )}
        {activeSection === "connection" && (
          <div className="overflow-y-auto h-full p-8 max-w-2xl">
            <ConnectionSettings />
          </div>
        )}
        {activeSection === "preview" && <ThemeShowcase />}
      </div>
    </div>
  );
}
