import { create } from "zustand";
import type { ThemeDefinition } from "../types";
import { builtInThemes } from "../lib/built-in-themes";

interface ThemeState {
  themes: ThemeDefinition[];
  activeThemeId: string;
  mode: "light" | "dark" | "system";
  initialized: boolean;

  initialize: () => Promise<void>;
  setActiveTheme: (id: string) => void;
  setMode: (mode: "light" | "dark" | "system") => void;
  installTheme: (theme: ThemeDefinition) => void;
  removeTheme: (id: string) => void;
  getActiveTheme: () => ThemeDefinition | undefined;
}

function persistToFile(state: ThemeState): void {
  // Only persist user-installed themes (not built-in)
  const userThemes = state.themes.filter((t) => !t.isBuiltIn);
  window.api?.config.saveThemes({
    version: 1,
    themes: userThemes,
    activeThemeId: state.activeThemeId,
    mode: state.mode,
  });
}

export const useThemeStore = create<ThemeState>()((set, get) => ({
  themes: builtInThemes,
  activeThemeId: "twitter",
  mode: "dark",
  initialized: false,

  initialize: async () => {
    if (get().initialized) return;
    try {
      const config = await window.api?.config.getThemes();
      if (!config) {
        set({ initialized: true });
        return;
      }

      // Merge: built-in themes from code + user themes from disk
      const userThemes = (config.themes ?? []).filter((t) => !t.isBuiltIn);
      const merged = [...builtInThemes, ...userThemes];

      // Validate activeThemeId exists in merged set
      const activeExists = merged.some((t) => t.id === config.activeThemeId);

      set({
        themes: merged,
        activeThemeId: activeExists ? config.activeThemeId : "twitter",
        mode: config.mode ?? "dark",
        initialized: true,
      });
    } catch {
      set({ initialized: true });
    }
  },

  setActiveTheme: (id: string) => {
    const theme = get().themes.find((t) => t.id === id);
    if (theme) {
      set({ activeThemeId: id });
      persistToFile(get());
    }
  },

  setMode: (mode: "light" | "dark" | "system") => {
    set({ mode });
    persistToFile(get());
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
    persistToFile(get());
  },

  removeTheme: (id: string) => {
    const theme = get().themes.find((t) => t.id === id);
    // Cannot remove built-in themes
    if (!theme || theme.isBuiltIn) return;

    set((state) => ({
      themes: state.themes.filter((t) => t.id !== id),
      // If removing the active theme, fall back to default
      activeThemeId: state.activeThemeId === id ? "default" : state.activeThemeId,
    }));
    persistToFile(get());
  },

  getActiveTheme: () => {
    const state = get();
    return state.themes.find((t) => t.id === state.activeThemeId);
  },
}));
