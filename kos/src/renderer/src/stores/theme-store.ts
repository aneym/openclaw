import { create } from "zustand";
import type { ThemeDefinition } from "../types";
import { builtInThemes } from "../lib/built-in-themes";

export interface GlassSettings {
  chromeTint: number; // 0–100, default 6 (light) / 12 (dark)
  sidebarTint: number; // 0–100, default 8 (light) / 15 (dark)
  borderOpacity: number; // 0–100, default 50
}

const DEFAULT_GLASS: GlassSettings = {
  chromeTint: 6,
  sidebarTint: 8,
  borderOpacity: 50,
};

interface ThemeState {
  themes: ThemeDefinition[];
  activeThemeId: string;
  mode: "light" | "dark" | "system";
  liquidGlass: boolean;
  glass: GlassSettings;

  setActiveTheme: (id: string) => void;
  setMode: (mode: "light" | "dark" | "system") => void;
  setLiquidGlass: (enabled: boolean) => void;
  setGlass: (patch: Partial<GlassSettings>) => void;
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
    liquidGlass: state.liquidGlass,
    glass: state.glass,
  });
}

// Read initial config synchronously from preload (set before React renders)
function getInitialState() {
  const config = window.api?.initialThemeConfig;
  if (!config) {
    return {
      themes: builtInThemes,
      activeThemeId: "twitter",
      mode: "dark" as const,
      liquidGlass: true,
      glass: DEFAULT_GLASS,
    };
  }

  const builtInIds = new Set(builtInThemes.map((t) => t.id));
  const userThemes = (config.themes ?? []).filter(
    (t) => !t.isBuiltIn && !builtInIds.has(t.id),
  ) as ThemeDefinition[];
  const merged = [...builtInThemes, ...userThemes];
  const activeExists = merged.some((t) => t.id === config.activeThemeId);

  return {
    themes: merged,
    activeThemeId: activeExists ? config.activeThemeId : "twitter",
    mode: config.mode ?? ("dark" as const),
    liquidGlass: config.liquidGlass ?? true,
    glass: { ...DEFAULT_GLASS, ...config.glass },
  };
}

const initial = getInitialState();

export const useThemeStore = create<ThemeState>()((set, get) => ({
  themes: initial.themes,
  activeThemeId: initial.activeThemeId,
  mode: initial.mode,
  liquidGlass: initial.liquidGlass,
  glass: initial.glass,

  setLiquidGlass: (enabled: boolean) => {
    set({ liquidGlass: enabled });
    persistToFile(get());
  },

  setGlass: (patch: Partial<GlassSettings>) => {
    set((state) => ({ glass: { ...state.glass, ...patch } }));
    persistToFile(get());
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
