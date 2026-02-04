import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DashboardFilter = "all" | "unassigned";

interface DashboardState {
  filter: DashboardFilter;
  setFilter: (filter: DashboardFilter) => void;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      filter: "all",

      setFilter: (filter: DashboardFilter) => {
        set({ filter });
      },
    }),
    {
      name: "kos-dashboard",
    },
  ),
);
