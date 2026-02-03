import type { ThemeDefinition } from '../types'

/**
 * Track which CSS custom properties we've set as inline styles
 * so we can clean them up when switching themes.
 */
let appliedProperties: string[] = []

/**
 * Apply a theme by setting CSS custom properties on document.documentElement.
 *
 * @param theme - The theme to apply, or undefined to reset to defaults
 * @param mode - 'light' or 'dark' (resolved, not 'system')
 */
export function applyTheme(theme: ThemeDefinition | undefined, mode: 'light' | 'dark'): void {
  const root = document.documentElement

  // Clean up previously applied inline style properties
  for (const prop of appliedProperties) {
    root.style.removeProperty(prop)
  }
  appliedProperties = []

  // Toggle dark class
  if (mode === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }

  // If no theme or the built-in default, let the CSS file handle everything
  if (!theme || theme.isBuiltIn) {
    return
  }

  // Apply shared 'theme' vars (font, radius, tracking, etc.)
  if (theme.cssVars.theme) {
    for (const [key, value] of Object.entries(theme.cssVars.theme)) {
      const prop = `--${key}`
      root.style.setProperty(prop, value)
      appliedProperties.push(prop)
    }
  }

  // Apply mode-specific vars
  const modeVars = mode === 'dark' ? theme.cssVars.dark : theme.cssVars.light
  for (const [key, value] of Object.entries(modeVars)) {
    const prop = `--${key}`
    root.style.setProperty(prop, value)
    appliedProperties.push(prop)
  }
}

/**
 * Resolve 'system' mode to 'light' or 'dark' based on OS preference.
 */
export function resolveMode(mode: 'light' | 'dark' | 'system'): 'light' | 'dark' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return mode
}
