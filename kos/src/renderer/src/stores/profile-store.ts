import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { Profile } from "../types"
import {
  DEFAULT_PROFILE_ID,
  createDefaultProfile,
  createPersonalProfile,
} from "../types/profile"

interface ProfileState {
  profiles: Map<string, Profile>
  activeProfileId: string

  // Actions
  createProfile: (data: Omit<Profile, "id" | "createdAt" | "updatedAt">) => string
  updateProfile: (id: string, updates: Partial<Profile>) => void
  deleteProfile: (id: string) => void
  setActiveProfile: (id: string) => void

  // Selectors
  getProfile: (id: string) => Profile | undefined
  getActiveProfile: () => Profile | undefined
  getAllProfiles: () => Profile[]
}

function generateProfileId(): string {
  return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// Initialize with Work (default) and Personal profiles
const initialProfiles = new Map<string, Profile>()
const workProfile = createDefaultProfile()
const personalProfile = createPersonalProfile()
initialProfiles.set(workProfile.id, workProfile)
initialProfiles.set(personalProfile.id, personalProfile)

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      profiles: initialProfiles,
      activeProfileId: DEFAULT_PROFILE_ID,

      createProfile: (data) => {
        const id = generateProfileId()
        const now = Date.now()
        const profile: Profile = {
          ...data,
          id,
          createdAt: now,
          updatedAt: now,
        }

        const { profiles } = get()
        const updated = new Map(profiles)
        updated.set(id, profile)
        set({ profiles: updated })

        return id
      },

      updateProfile: (id, updates) => {
        const { profiles } = get()
        const profile = profiles.get(id)
        if (!profile) return

        const updated = new Map(profiles)
        updated.set(id, {
          ...profile,
          ...updates,
          updatedAt: Date.now(),
        })
        set({ profiles: updated })
      },

      deleteProfile: (id) => {
        const { profiles, activeProfileId } = get()

        // Cannot delete if only one profile exists
        if (profiles.size <= 1) return

        // Cannot delete default profile if it's the active one - switch first
        const profile = profiles.get(id)
        if (!profile) return

        const updated = new Map(profiles)
        updated.delete(id)

        // If deleting active profile, switch to another
        let newActiveId = activeProfileId
        if (activeProfileId === id) {
          // Find another profile to switch to (prefer default, then first available)
          const remaining = Array.from(updated.values())
          const defaultProfile = remaining.find((p) => p.isDefault)
          newActiveId = defaultProfile?.id || remaining[0]?.id || DEFAULT_PROFILE_ID
        }

        // If we deleted the default profile, mark another as default
        if (profile.isDefault && updated.size > 0) {
          const firstProfile = updated.values().next().value
          if (firstProfile) {
            updated.set(firstProfile.id, { ...firstProfile, isDefault: true })
          }
        }

        set({ profiles: updated, activeProfileId: newActiveId })
      },

      setActiveProfile: (id) => {
        const { profiles } = get()
        if (profiles.has(id)) {
          set({ activeProfileId: id })
        }
      },

      getProfile: (id) => get().profiles.get(id),

      getActiveProfile: () => {
        const { profiles, activeProfileId } = get()
        return profiles.get(activeProfileId)
      },

      getAllProfiles: () =>
        Array.from(get().profiles.values()).sort((a, b) => {
          // Default profile first, then alphabetically
          if (a.isDefault && !b.isDefault) return -1
          if (!a.isDefault && b.isDefault) return 1
          return a.name.localeCompare(b.name)
        }),
    }),
    {
      name: "kos-profiles",
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name)
          if (!str) return null
          const { state } = JSON.parse(str)
          return {
            state: {
              ...state,
              profiles: new Map(state.profiles || []),
            },
          }
        },
        setItem: (name, value) => {
          const { state } = value
          localStorage.setItem(
            name,
            JSON.stringify({
              state: {
                ...state,
                profiles: Array.from(state.profiles.entries()),
              },
            }),
          )
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
      // Ensure default profile exists after rehydration
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Ensure at least the default profile exists
          if (state.profiles.size === 0) {
            state.profiles.set(DEFAULT_PROFILE_ID, createDefaultProfile())
            state.activeProfileId = DEFAULT_PROFILE_ID
            useProfileStore.setState({
              profiles: state.profiles,
              activeProfileId: DEFAULT_PROFILE_ID,
            })
          }

          // Ensure active profile exists
          if (!state.profiles.has(state.activeProfileId)) {
            const firstProfile = state.profiles.values().next().value
            if (firstProfile) {
              useProfileStore.setState({ activeProfileId: firstProfile.id })
            }
          }
        }
      },
    },
  ),
)

// Convenience selector hooks
export function useActiveProfile() {
  const profiles = useProfileStore((s) => s.profiles)
  const activeProfileId = useProfileStore((s) => s.activeProfileId)
  return profiles.get(activeProfileId)
}

export function useActiveProfileId() {
  return useProfileStore((s) => s.activeProfileId)
}
