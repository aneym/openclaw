import { Briefcase, Check, Home, User } from "lucide-react";
import { useMemo } from "react";
import type { Profile } from "../../types";
import { cn } from "../../lib/utils";
import { useProfileStore, useActiveProfile } from "../../stores/profile-store";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

const PROFILE_ICONS: Record<string, typeof User> = {
  user: User,
  briefcase: Briefcase,
  home: Home,
};

interface ProfileSwitcherDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileSwitcherDialog({ open, onOpenChange }: ProfileSwitcherDialogProps) {
  const activeProfile = useActiveProfile();
  const profiles = useProfileStore((s) => s.profiles);
  const setActiveProfile = useProfileStore((s) => s.setActiveProfile);

  const sortedProfiles = useMemo(() => {
    return Array.from(profiles.values()).sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [profiles]);

  const handleSelectProfile = (profile: Profile) => {
    setActiveProfile(profile.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Switch Profile</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 py-2">
          {sortedProfiles.map((profile) => {
            const Icon = profile.icon ? (PROFILE_ICONS[profile.icon] ?? User) : User;
            const isActive = profile.id === activeProfile?.id;

            return (
              <button
                key={profile.id}
                onClick={() => handleSelectProfile(profile)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-md",
                  "text-left transition-colors",
                  isActive ? "bg-primary/10 text-primary" : "hover:bg-accent text-foreground",
                )}
              >
                <div
                  className="flex items-center justify-center w-8 h-8 rounded-md"
                  style={{
                    backgroundColor: profile.color ? `${profile.color}20` : "hsl(var(--accent))",
                  }}
                >
                  <Icon
                    className="w-4 h-4"
                    style={{ color: profile.color || "hsl(var(--foreground))" }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{profile.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{profile.gatewayUrl}</div>
                </div>
                {isActive && <Check className="w-5 h-5 text-primary" />}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">Cmd+Shift+P</kbd>{" "}
          to open this dialog
        </p>
      </DialogContent>
    </Dialog>
  );
}
