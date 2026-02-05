import { create } from "zustand";
import { persist } from "zustand/middleware";

interface NotificationState {
  soundEnabled: boolean;
  soundId: string;
  soundVolume: number;
  dockBadgeEnabled: boolean;

  setSoundEnabled: (enabled: boolean) => void;
  setSoundId: (id: string) => void;
  setSoundVolume: (volume: number) => void;
  setDockBadgeEnabled: (enabled: boolean) => void;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      soundEnabled: true,
      soundId: "chime",
      soundVolume: 0.5,
      dockBadgeEnabled: true,

      setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
      setSoundId: (id) => set({ soundId: id }),
      setSoundVolume: (volume) => set({ soundVolume: volume }),
      setDockBadgeEnabled: (enabled) => set({ dockBadgeEnabled: enabled }),
    }),
    {
      name: "kos-notifications",
    },
  ),
);
