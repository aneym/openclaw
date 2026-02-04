import { Check, ChevronDown, Plus, User, Briefcase, Home, Settings } from "lucide-react";
import { useMemo, useState } from "react";
import type { Profile } from "../../types";
import { cn } from "../../lib/utils";
import { useProfileStore, useActiveProfile } from "../../stores/profile-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

// Map profile icon names to Lucide components
const PROFILE_ICONS: Record<string, typeof User> = {
  user: User,
  briefcase: Briefcase,
  home: Home,
};

interface ProfileSwitcherProps {
  onOpenSettings?: () => void;
  onCreateProfile?: () => void;
}

export function ProfileSwitcher({ onOpenSettings, onCreateProfile }: ProfileSwitcherProps) {
  const activeProfile = useActiveProfile();
  const profiles = useProfileStore((s) => s.profiles);
  const setActiveProfile = useProfileStore((s) => s.setActiveProfile);
  const [open, setOpen] = useState(false);

  const sortedProfiles = useMemo(() => {
    return Array.from(profiles.values()).sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [profiles]);

  const handleSelectProfile = (profile: Profile) => {
    setActiveProfile(profile.id);
    setOpen(false);
  };

  const Icon = activeProfile?.icon ? (PROFILE_ICONS[activeProfile.icon] ?? User) : User;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm",
            "text-foreground hover:bg-accent/50 transition-colors",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <div
            className="flex items-center justify-center w-5 h-5 rounded-md"
            style={{
              backgroundColor: activeProfile?.color
                ? `${activeProfile.color}20`
                : "hsl(var(--accent))",
            }}
          >
            <Icon
              className="w-3.5 h-3.5"
              style={{
                color: activeProfile?.color ?? "hsl(var(--foreground))",
              }}
            />
          </div>
          <span className="font-medium truncate max-w-[120px]">
            {activeProfile?.name ?? "Profile"}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {sortedProfiles.map((profile) => {
          const ProfileIcon = profile.icon ? (PROFILE_ICONS[profile.icon] ?? User) : User;
          const isActive = profile.id === activeProfile?.id;

          return (
            <DropdownMenuItem
              key={profile.id}
              onClick={() => handleSelectProfile(profile)}
              className="flex items-center gap-2 cursor-pointer"
            >
              <div
                className="flex items-center justify-center w-5 h-5 rounded-md"
                style={{
                  backgroundColor: profile.color ? `${profile.color}20` : "hsl(var(--accent))",
                }}
              >
                <ProfileIcon
                  className="w-3.5 h-3.5"
                  style={{ color: profile.color ?? "hsl(var(--foreground))" }}
                />
              </div>
              <span className="flex-1 truncate">{profile.name}</span>
              {isActive && <Check className="w-4 h-4 text-primary" />}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        {onCreateProfile && (
          <DropdownMenuItem onClick={onCreateProfile} className="cursor-pointer">
            <Plus className="w-4 h-4 mr-2" />
            New Profile
          </DropdownMenuItem>
        )}
        {onOpenSettings && (
          <DropdownMenuItem onClick={onOpenSettings} className="cursor-pointer">
            <Settings className="w-4 h-4 mr-2" />
            Manage Profiles
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Export icon map for use in profile creation/editing
export { PROFILE_ICONS };
