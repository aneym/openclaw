import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PanelLayout } from '../types';

interface PanelState {
  layouts: Map<string, PanelLayout>;

  getLayout: (threadId: string) => PanelLayout | undefined;
  setLayout: (threadId: string, layout: PanelLayout) => void;
  deleteLayout: (threadId: string) => void;
}

export const usePanelStore = create<PanelState>()(
  persist(
    (set, get) => ({
      layouts: new Map(),

      getLayout: (threadId: string) => {
        return get().layouts.get(threadId);
      },

      setLayout: (threadId: string, layout: PanelLayout) => {
        const { layouts } = get();
        const updated = new Map(layouts);
        updated.set(threadId, layout);
        set({ layouts: updated });
      },

      deleteLayout: (threadId: string) => {
        const { layouts } = get();
        const updated = new Map(layouts);
        updated.delete(threadId);
        set({ layouts: updated });
      },
    }),
    {
      name: 'kos-panels',
      // Custom storage to handle Map serialization
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const { state } = JSON.parse(str);
          return {
            state: {
              ...state,
              layouts: new Map(state.layouts || []),
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
                layouts: Array.from(state.layouts.entries()),
              },
            })
          );
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);
