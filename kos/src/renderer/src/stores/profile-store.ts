import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Profile } from "../types";
import {
  DEFAULT_GATEWAY_URL,
  DEFAULT_PROFILE_ID,
  LEGACY_DEV_GATEWAY_URL,
  resolveGatewayConnection,
  createDefaultProfile,
  createPersonalProfile,
} from "../types/profile";

interface ProfileState {
  profiles: Map<string, Profile>;
  activeProfileId: string;

  // Actions
  createProfile: (data: Omit<Profile, "id" | "createdAt" | "updatedAt">) => string;
  updateProfile: (id: string, updates: Partial<Profile>) => void;
  deleteProfile: (id: string) => void;
  setActiveProfile: (id: string) => void;

  // Selectors
  getProfile: (id: string) => Profile | undefined;
  getActiveProfile: () => Profile | undefined;
  getAllProfiles: () => Profile[];
}

function generateProfileId(): string {
  return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function migrateLegacyDefaultPorts(profiles: Map<string, Profile>): Map<string, Profile> {
  const now = Date.now();
  let changed = false;
  const updated = new Map(profiles);

  for (const [id, profile] of updated) {
    const normalized = resolveGatewayConnection({
      gatewayUrl: profile.gatewayUrl,
      gatewayToken: profile.gatewayToken,
    });
    const prevToken = profile.gatewayToken ?? "";
    const nextToken = normalized.gatewayToken ?? "";
    if (normalized.gatewayUrl === profile.gatewayUrl && prevToken === nextToken) {
      continue;
    }

    updated.set(id, {
      ...profile,
      gatewayUrl: normalized.gatewayUrl,
      gatewayToken: normalized.gatewayToken,
      updatedAt: now,
    });
    changed = true;
  }

  for (const id of [DEFAULT_PROFILE_ID, "personal"]) {
    const profile = updated.get(id);
    if (!profile || profile.gatewayUrl !== LEGACY_DEV_GATEWAY_URL) {
      continue;
    }

    updated.set(id, {
      ...profile,
      gatewayUrl: DEFAULT_GATEWAY_URL,
      updatedAt: now,
    });
    changed = true;
  }

  return changed ? updated : profiles;
}

// Initialize with Work (default) and Personal profiles
const initialProfiles = new Map<string, Profile>();
const workProfile = createDefaultProfile();
const personalProfile = createPersonalProfile();
initialProfiles.set(workProfile.id, workProfile);
initialProfiles.set(personalProfile.id, personalProfile);

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      profiles: initialProfiles,
      activeProfileId: DEFAULT_PROFILE_ID,

      createProfile: (data) => {
        const id = generateProfileId();
        const now = Date.now();
        const profile: Profile = {
          ...data,
          id,
          createdAt: now,
          updatedAt: now,
        };

        const { profiles } = get();
        const updated = new Map(profiles);
        updated.set(id, profile);
        set({ profiles: updated });

        return id;
      },

      updateProfile: (id, updates) => {
        const { profiles } = get();
        const profile = profiles.get(id);
        if (!profile) {
          return;
        }

        const updated = new Map(profiles);
        updated.set(id, {
          ...profile,
          ...updates,
          updatedAt: Date.now(),
        });
        set({ profiles: updated });
      },

      deleteProfile: (id) => {
        const { profiles, activeProfileId } = get();

        // Cannot delete if only one profile exists
        if (profiles.size <= 1) {
          return;
        }

        // Cannot delete default profile if it's the active one - switch first
        const profile = profiles.get(id);
        if (!profile) {
          return;
        }

        const updated = new Map(profiles);
        updated.delete(id);

        // If deleting active profile, switch to another
        let newActiveId = activeProfileId;
        if (activeProfileId === id) {
          // Find another profile to switch to (prefer default, then first available)
          const remaining = Array.from(updated.values());
          const defaultProfile = remaining.find((p) => p.isDefault);
          newActiveId = defaultProfile?.id || remaining[0]?.id || DEFAULT_PROFILE_ID;
        }

        // If we deleted the default profile, mark another as default
        if (profile.isDefault && updated.size > 0) {
          const firstProfile = updated.values().next().value;
          if (firstProfile) {
            updated.set(firstProfile.id, { ...firstProfile, isDefault: true });
          }
        }

        set({ profiles: updated, activeProfileId: newActiveId });
      },

      setActiveProfile: (id) => {
        const { profiles } = get();
        if (profiles.has(id)) {
          set({ activeProfileId: id });
        }
      },

      getProfile: (id) => get().profiles.get(id),

      getActiveProfile: () => {
        const { profiles, activeProfileId } = get();
        return profiles.get(activeProfileId);
      },

      getAllProfiles: () =>
        Array.from(get().profiles.values()).sort((a, b) => {
          // Default profile first, then alphabetically
          if (a.isDefault && !b.isDefault) {
            return -1;
          }
          if (!a.isDefault && b.isDefault) {
            return 1;
          }
          return a.name.localeCompare(b.name);
        }),
    }),
    {
      name: "kos-profiles",
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) {
            return null;
          }
          const { state } = JSON.parse(str);
          return {
            state: {
              ...state,
              profiles: new Map(state.profiles || []),
            },
          };
        },
        setItem: (name, value) => {
          const { state } = value;
          localStorage.setItem(
            name,
            JSON.stringify({
              state: {
                ...state,
                profiles: Array.from(state.profiles.entries()),
              },
            }),
          );
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
      // Ensure default profile exists after rehydration
      onRehydrateStorage: () => (state) => {
        if (state) {
          let nextProfiles = state.profiles;
          let nextActiveProfileId = state.activeProfileId;
          let shouldWrite = false;

          // Ensure at least the default profile exists
          if (nextProfiles.size === 0) {
            nextProfiles.set(DEFAULT_PROFILE_ID, createDefaultProfile());
            nextActiveProfileId = DEFAULT_PROFILE_ID;
            shouldWrite = true;
          }

          // Migrate legacy built-in profile defaults from 19001 -> 18789.
          const migratedProfiles = migrateLegacyDefaultPorts(nextProfiles);
          if (migratedProfiles !== nextProfiles) {
            nextProfiles = migratedProfiles;
            shouldWrite = true;
          }

          // Ensure active profile exists
          if (!nextProfiles.has(nextActiveProfileId)) {
            const firstProfile = nextProfiles.values().next().value;
            if (firstProfile) {
              nextActiveProfileId = firstProfile.id;
              shouldWrite = true;
            }
          }

          if (shouldWrite) {
            state.profiles = nextProfiles;
            state.activeProfileId = nextActiveProfileId;
            useProfileStore.setState({
              profiles: nextProfiles,
              activeProfileId: nextActiveProfileId,
            });
          }
        }
      },
    },
  ),
);

// Convenience selector hooks
export function useActiveProfile() {
  const profiles = useProfileStore((s) => s.profiles);
  const activeProfileId = useProfileStore((s) => s.activeProfileId);
  return profiles.get(activeProfileId);
}

export function useActiveProfileId() {
  return useProfileStore((s) => s.activeProfileId);
}
