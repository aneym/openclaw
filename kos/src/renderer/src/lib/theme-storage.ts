import type { ThemeDefinition } from "../types";

const THEME_STORAGE_KEY = "kos-theme-config-v1";

export interface ThemeStorageConfig {
  version: 1;
  themes: ThemeDefinition[];
  activeThemeId: string;
  mode: "light" | "dark" | "system";
  liquidGlass?: boolean;
  glass?: { chromeTint?: number; sidebarTint?: number; borderOpacity?: number };
}

function isThemeMode(value: unknown): value is "light" | "dark" | "system" {
  return value === "light" || value === "dark" || value === "system";
}

function parseThemeStorageConfig(raw: string | null): ThemeStorageConfig | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ThemeStorageConfig>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if (!Array.isArray(parsed.themes)) {
      return null;
    }
    if (typeof parsed.activeThemeId !== "string" || !isThemeMode(parsed.mode)) {
      return null;
    }
    return {
      version: 1,
      themes: parsed.themes as ThemeDefinition[],
      activeThemeId: parsed.activeThemeId,
      mode: parsed.mode,
      liquidGlass: parsed.liquidGlass,
      glass: parsed.glass,
    };
  } catch {
    return null;
  }
}

export function getInitialThemeConfig(): ThemeStorageConfig | null {
  if (typeof window === "undefined") {
    return null;
  }
  const fromBridge = window.api?.initialThemeConfig as ThemeStorageConfig | null | undefined;
  if (fromBridge) {
    return fromBridge;
  }
  return parseThemeStorageConfig(localStorage.getItem(THEME_STORAGE_KEY));
}

export function saveThemeConfig(config: ThemeStorageConfig): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore localStorage write failures (private mode/quota)
  }

  const saveThemes = window.api?.config?.saveThemes;
  if (!saveThemes) {
    return;
  }
  void saveThemes(config).catch(() => {
    // Ignore desktop persistence failures and keep local fallback.
  });
}
