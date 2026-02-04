import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DashboardFilter = "all" | "unassigned";

interface DashboardState {
  filter: DashboardFilter;
  activeChatId: string | null;
  setFilter: (filter: DashboardFilter) => void;
  setActiveChatId: (chatId: string | null) => void;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      filter: "all",
      activeChatId: null,

      setFilter: (filter: DashboardFilter) => {
        set({ filter });
      },

      setActiveChatId: (chatId: string | null) => {
        set({ activeChatId: chatId });
      },
    }),
    {
      name: "kos-dashboard",
    },
  ),
);
