import { create } from "zustand";
import { persist } from "zustand/middleware";

interface DraftState {
  drafts: Record<string, string>;
  getDraft: (sessionKey: string) => string;
  setDraft: (sessionKey: string, text: string) => void;
  clearDraft: (sessionKey: string) => void;
}

export const useDraftStore = create<DraftState>()(
  persist(
    (set, get) => ({
      drafts: {},

      getDraft: (sessionKey: string) => {
        return get().drafts[sessionKey] ?? "";
      },

      setDraft: (sessionKey: string, text: string) => {
        set((s) => ({
          drafts: { ...s.drafts, [sessionKey]: text },
        }));
      },

      clearDraft: (sessionKey: string) => {
        set((s) => {
          const { [sessionKey]: _, ...rest } = s.drafts;
          return { drafts: rest };
        });
      },
    }),
    { name: "kos-drafts" },
  ),
);
