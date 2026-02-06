import { Briefcase, Check, Home, Pencil, Plus, Trash2, User } from "lucide-react";
import { useState } from "react";
import type { Profile } from "../../types";
import { cn } from "../../lib/utils";
import { useProfileStore, useActiveProfile } from "../../stores/profile-store";
import { DEFAULT_GATEWAY_URL } from "../../types/profile";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

const PROFILE_ICONS = [
  { id: "user", icon: User, label: "User" },
  { id: "briefcase", icon: Briefcase, label: "Work" },
  { id: "home", icon: Home, label: "Home" },
];

const PROFILE_COLORS = [
  { id: "blue", value: "#3b82f6", label: "Blue" },
  { id: "green", value: "#22c55e", label: "Green" },
  { id: "purple", value: "#a855f7", label: "Purple" },
  { id: "orange", value: "#f97316", label: "Orange" },
  { id: "pink", value: "#ec4899", label: "Pink" },
  { id: "gray", value: "#6b7280", label: "Gray" },
];

interface ProfileFormData {
  name: string;
  icon: string;
  color: string;
  gatewayUrl: string;
  gatewayToken: string;
}

const defaultFormData: ProfileFormData = {
  name: "",
  icon: "user",
  color: "#3b82f6",
  gatewayUrl: DEFAULT_GATEWAY_URL,
  gatewayToken: "",
};

export function ProfileSettings() {
  const profiles = useProfileStore((s) => s.profiles);
  const activeProfile = useActiveProfile();
  const createProfile = useProfileStore((s) => s.createProfile);
  const updateProfile = useProfileStore((s) => s.updateProfile);
  const deleteProfile = useProfileStore((s) => s.deleteProfile);
  const setActiveProfile = useProfileStore((s) => s.setActiveProfile);

  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<ProfileFormData>(defaultFormData);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const sortedProfiles = Array.from(profiles.values()).sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return a.name.localeCompare(b.name);
  });

  const handleEdit = (profile: Profile) => {
    setFormData({
      name: profile.name,
      icon: profile.icon || "user",
      color: profile.color || "#3b82f6",
      gatewayUrl: profile.gatewayUrl,
      gatewayToken: profile.gatewayToken || "",
    });
    setEditingProfile(profile);
  };

  const handleCreate = () => {
    setFormData(defaultFormData);
    setIsCreating(true);
  };

  const handleSave = () => {
    if (isCreating) {
      createProfile({
        name: formData.name || "New Profile",
        icon: formData.icon,
        color: formData.color,
        gatewayUrl: formData.gatewayUrl || DEFAULT_GATEWAY_URL,
        gatewayToken: formData.gatewayToken || undefined,
        isDefault: false,
      });
      setIsCreating(false);
    } else if (editingProfile) {
      updateProfile(editingProfile.id, {
        name: formData.name,
        icon: formData.icon,
        color: formData.color,
        gatewayUrl: formData.gatewayUrl,
        gatewayToken: formData.gatewayToken || undefined,
      });
      setEditingProfile(null);
    }
    setFormData(defaultFormData);
  };

  const handleCancel = () => {
    setEditingProfile(null);
    setIsCreating(false);
    setFormData(defaultFormData);
  };

  const handleDelete = (id: string) => {
    deleteProfile(id);
    setDeleteConfirmId(null);
  };

  const dialogOpen = isCreating || editingProfile !== null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Profiles</h3>
          <p className="text-sm text-muted-foreground">
            Manage work and personal contexts with separate gateway connections and settings.
          </p>
        </div>
        <Button onClick={handleCreate} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          New Profile
        </Button>
      </div>

      <div className="space-y-2">
        {sortedProfiles.map((profile) => {
          const IconComponent = PROFILE_ICONS.find((i) => i.id === profile.icon)?.icon || User;
          const isActive = profile.id === activeProfile?.id;

          return (
            <div
              key={profile.id}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border",
                isActive ? "border-primary bg-primary/5" : "border-border",
              )}
            >
              <div
                className="flex items-center justify-center w-10 h-10 rounded-lg"
                style={{
                  backgroundColor: profile.color ? `${profile.color}20` : "hsl(var(--accent))",
                }}
              >
                <IconComponent
                  className="w-5 h-5"
                  style={{ color: profile.color || "hsl(var(--foreground))" }}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{profile.name}</span>
                  {profile.isDefault && (
                    <span className="text-xs px-1.5 py-0.5 bg-muted rounded">Default</span>
                  )}
                  {isActive && <Check className="w-4 h-4 text-primary" />}
                </div>
                <p className="text-sm text-muted-foreground truncate">{profile.gatewayUrl}</p>
              </div>

              <div className="flex items-center gap-1">
                {!isActive && (
                  <Button variant="ghost" size="sm" onClick={() => setActiveProfile(profile.id)}>
                    Switch
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => handleEdit(profile)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                {!profile.isDefault && profiles.size > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteConfirmId(profile.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit/Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && handleCancel()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isCreating ? "Create Profile" : "Edit Profile"}</DialogTitle>
            <DialogDescription>
              {isCreating
                ? "Create a new profile to separate your work and personal contexts."
                : "Update your profile settings."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Profile name"
              />
            </div>

            <div className="space-y-2">
              <Label>Icon</Label>
              <div className="flex gap-2">
                {PROFILE_ICONS.map(({ id, icon: Icon, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFormData({ ...formData, icon: id })}
                    className={cn(
                      "p-2 rounded-md border transition-colors",
                      formData.icon === id
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-accent",
                    )}
                    title={label}
                  >
                    <Icon className="w-5 h-5" />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2">
                {PROFILE_COLORS.map(({ id, value, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFormData({ ...formData, color: value })}
                    className={cn(
                      "w-8 h-8 rounded-full border-2 transition-all",
                      formData.color === value
                        ? "border-foreground scale-110"
                        : "border-transparent",
                    )}
                    style={{ backgroundColor: value }}
                    title={label}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gatewayUrl">Gateway URL</Label>
              <Input
                id="gatewayUrl"
                value={formData.gatewayUrl}
                onChange={(e) => setFormData({ ...formData, gatewayUrl: e.target.value })}
                placeholder={DEFAULT_GATEWAY_URL}
              />
              <p className="text-xs text-muted-foreground">
                WebSocket URL for the OpenClaw gateway.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gatewayToken">Gateway Token (optional)</Label>
              <Input
                id="gatewayToken"
                type="password"
                value={formData.gatewayToken}
                onChange={(e) => setFormData({ ...formData, gatewayToken: e.target.value })}
                placeholder="Enter token if required"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave}>{isCreating ? "Create" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Profile</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this profile? Projects and chats associated with this
              profile will become unassigned.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
