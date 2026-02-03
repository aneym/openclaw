import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemeDefinition } from '../types';
import { builtInThemes } from '../lib/built-in-themes';

interface ThemeState {
  themes: ThemeDefinition[];
  activeThemeId: string;
  mode: 'light' | 'dark' | 'system';

  setActiveTheme: (id: string) => void;
  setMode: (mode: 'light' | 'dark' | 'system') => void;
  installTheme: (theme: ThemeDefinition) => void;
  removeTheme: (id: string) => void;
  getActiveTheme: () => ThemeDefinition | undefined;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      themes: builtInThemes,
      activeThemeId: 'twitter',
      mode: 'dark',

      setActiveTheme: (id: string) => {
        const theme = get().themes.find((t) => t.id === id);
        if (theme) {
          set({ activeThemeId: id });
        }
      },

      setMode: (mode: 'light' | 'dark' | 'system') => {
        set({ mode });
      },

      installTheme: (theme: ThemeDefinition) => {
        set((state) => {
          // Replace if theme with same ID exists (update), otherwise add
          const existing = state.themes.findIndex((t) => t.id === theme.id);
          if (existing >= 0) {
            const updated = [...state.themes];
            updated[existing] = theme;
            return { themes: updated };
          }
          return { themes: [...state.themes, theme] };
        });
      },

      removeTheme: (id: string) => {
        const theme = get().themes.find((t) => t.id === id);
        // Cannot remove built-in themes
        if (!theme || theme.isBuiltIn) return;

        set((state) => ({
          themes: state.themes.filter((t) => t.id !== id),
          // If removing the active theme, fall back to default
          activeThemeId: state.activeThemeId === id ? 'default' : state.activeThemeId,
        }));
      },

      getActiveTheme: () => {
        const state = get();
        return state.themes.find((t) => t.id === state.activeThemeId);
      },
    }),
    {
      name: 'kos-themes',
      // Only persist these keys (not functions)
      partialize: (state) => ({
        themes: state.themes,
        activeThemeId: state.activeThemeId,
        mode: state.mode,
      }),
    },
  ),
);
