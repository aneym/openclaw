import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SidebarUIState {
  // Groups the user has explicitly collapsed
  collapsedGroups: Set<string>;
  // Groups the user has explicitly toggled (expanded or collapsed)
  // If a group is not in this set, use default behavior (collapse unless active)
  userToggledGroups: Set<string>;

  toggleGroup: (group: string) => void;
  /**
   * Check if a group should be collapsed.
   * @param group - The group key (e.g., "dashboard-Active", "sidebar-Older")
   * @param activeGroupKey - The key of the group containing the active chat (optional)
   * @returns true if collapsed, false if expanded
   */
  isGroupCollapsed: (group: string, activeGroupKey?: string) => boolean;
}

export const useSidebarUIStore = create<SidebarUIState>()(
  persist(
    (set, get) => ({
      collapsedGroups: new Set<string>(),
      userToggledGroups: new Set<string>(),

      toggleGroup: (group: string) => {
        const { collapsedGroups, userToggledGroups } = get();
        const updatedCollapsed = new Set(collapsedGroups);
        const updatedToggled = new Set(userToggledGroups);

        // Mark this group as explicitly toggled by user
        updatedToggled.add(group);

        // Toggle collapsed state
        if (updatedCollapsed.has(group)) {
          updatedCollapsed.delete(group);
        } else {
          updatedCollapsed.add(group);
        }

        set({ collapsedGroups: updatedCollapsed, userToggledGroups: updatedToggled });
      },

      isGroupCollapsed: (group: string, activeGroupKey?: string) => {
        const { collapsedGroups, userToggledGroups } = get();

        // If user has explicitly toggled this group, respect their choice
        if (userToggledGroups.has(group)) {
          return collapsedGroups.has(group);
        }

        // Default: collapse everything except the group containing the active chat
        return group !== activeGroupKey;
      },
    }),
    {
      name: "kos-sidebar-ui",
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const { state } = JSON.parse(str);
          return {
            state: {
              ...state,
              collapsedGroups: new Set(state.collapsedGroups || []),
              userToggledGroups: new Set(state.userToggledGroups || []),
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
                collapsedGroups: Array.from(state.collapsedGroups),
                userToggledGroups: Array.from(state.userToggledGroups),
              },
            }),
          );
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    },
  ),
);
