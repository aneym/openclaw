import { useEffect, useCallback } from 'react';
import { useThemeStore } from '../stores/theme-store';
import { applyTheme, resolveMode } from '../lib/theme-applier';
import type { ThemeDefinition } from '../types';

export function useTheme() {
  const themes = useThemeStore((s) => s.themes);
  const activeThemeId = useThemeStore((s) => s.activeThemeId);
  const mode = useThemeStore((s) => s.mode);
  const setActiveTheme = useThemeStore((s) => s.setActiveTheme);
  const setMode = useThemeStore((s) => s.setMode);
  const installTheme = useThemeStore((s) => s.installTheme);
  const removeTheme = useThemeStore((s) => s.removeTheme);
  const getActiveTheme = useThemeStore((s) => s.getActiveTheme);

  const apply = useCallback(() => {
    const theme = getActiveTheme();
    const resolved = resolveMode(mode);
    applyTheme(theme, resolved);
  }, [getActiveTheme, mode]);

  // Apply theme on mount and when activeThemeId or mode changes
  useEffect(() => {
    apply();
  }, [apply, activeThemeId]);

  // Handle 'system' mode: listen for OS color scheme changes
  useEffect(() => {
    if (mode !== 'system') return;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => apply();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode, apply]);

  const theme = themes.find((t) => t.id === activeThemeId);

  return {
    theme,
    mode,
    themes,
    setTheme: setActiveTheme,
    setMode,
    installTheme,
    removeTheme,
  } as const satisfies {
    theme: ThemeDefinition | undefined;
    mode: 'light' | 'dark' | 'system';
    themes: ThemeDefinition[];
    setTheme: (id: string) => void;
    setMode: (mode: 'light' | 'dark' | 'system') => void;
    installTheme: (theme: ThemeDefinition) => void;
    removeTheme: (id: string) => void;
  };
}
