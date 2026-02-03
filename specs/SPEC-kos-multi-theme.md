# SPEC: kOS Multi-Theme Support

## Overview

Add a multi-theme system to kOS that supports installing themes from [tweakcn.com](https://tweakcn.com) registry URLs. Users can browse installed themes, select one, and install new ones by pasting a tweakcn URL. Themes override CSS custom properties at runtime.

## tweakcn Theme Format

Themes are fetched from URLs like:
```
https://tweakcn.com/r/themes/amber-minimal.json
```

The JSON structure:
```json
{
  "$schema": "https://ui.shadcn.com/schema/registry-item.json",
  "name": "amber-minimal",
  "type": "registry:style",
  "cssVars": {
    "theme": {
      "font-sans": "Inter, sans-serif",
      "radius": "0.375rem",
      ...
    },
    "light": {
      "background": "oklch(1.0000 0 0)",
      "foreground": "oklch(0.2686 0 0)",
      "primary": "oklch(0.7686 0.1647 70.0804)",
      ...all shadcn CSS vars...
    },
    "dark": {
      "background": "oklch(0.2046 0 0)",
      "foreground": "oklch(0.9219 0 0)",
      ...all shadcn CSS vars...
    }
  }
}
```

Key properties in `light`/`dark` blocks: `background`, `foreground`, `card`, `card-foreground`, `popover`, `popover-foreground`, `primary`, `primary-foreground`, `secondary`, `secondary-foreground`, `muted`, `muted-foreground`, `accent`, `accent-foreground`, `destructive`, `destructive-foreground`, `border`, `input`, `ring`, `chart-1` through `chart-5`, `radius`, `sidebar`, `sidebar-foreground`, `sidebar-primary`, `sidebar-primary-foreground`, `sidebar-accent`, `sidebar-accent-foreground`, `sidebar-border`, `sidebar-ring`, `font-sans`, `font-serif`, `font-mono`, `shadow-*` vars, `spacing`, `letter-spacing`.

The `theme` block has shared vars: `font-sans`, `font-mono`, `font-serif`, `radius`, `tracking-*`.

## Architecture

### Types (`src/renderer/src/types/theme.ts`)

```typescript
export interface ThemeDefinition {
  id: string;              // unique key, e.g. "amber-minimal"
  name: string;            // display name, e.g. "Amber Minimal"
  source?: string;         // tweakcn URL if installed from registry
  isBuiltIn: boolean;      // true for "Default" theme
  cssVars: {
    theme?: Record<string, string>;   // shared vars
    light: Record<string, string>;    // :root vars
    dark: Record<string, string>;     // .dark vars
  };
  installedAt: number;     // timestamp
}
```

Export from `types/index.ts`.

### Built-in Default Theme

Extract the current globals.css variables into a `ThemeDefinition` object as the "Default" built-in theme. This theme is always available and cannot be removed. When "Default" is active, no runtime overrides are applied — the CSS file provides the values.

### Theme Store (`src/renderer/src/stores/theme-store.ts`)

Zustand persist store:

```typescript
interface ThemeState {
  themes: ThemeDefinition[];         // all installed themes (including built-in)
  activeThemeId: string;             // currently active theme ID
  mode: 'light' | 'dark' | 'system'; // light/dark mode preference
  
  setActiveTheme: (id: string) => void;
  setMode: (mode: 'light' | 'dark' | 'system') => void;
  installTheme: (theme: ThemeDefinition) => void;
  removeTheme: (id: string) => void; // cannot remove built-in
  getActiveTheme: () => ThemeDefinition | undefined;
}
```

Persist key: `kos-themes`.

### Theme Applier (`src/renderer/src/lib/theme-applier.ts`)

A function `applyTheme(theme: ThemeDefinition | undefined, mode: 'light' | 'dark')`:

1. If theme is undefined or is the built-in default, **remove** all inline style overrides from `document.documentElement` (let CSS file handle it).
2. Otherwise, iterate over the theme's `cssVars.theme` (if any) and set each as `--{key}` on `:root`.
3. Based on `mode`, iterate over `cssVars.light` or `cssVars.dark` and set each as `--{key}` on `:root`.
4. Toggle `dark` class on `document.documentElement` based on mode.
5. For `system` mode, use `window.matchMedia('(prefers-color-scheme: dark)')` to detect.

### Theme Provider Hook (`src/renderer/src/hooks/use-theme.ts`)

A `useTheme()` hook that:
- Subscribes to the theme store
- On mount and when activeThemeId/mode changes, calls `applyTheme()`
- Handles `system` mode media query listener
- Returns `{ theme, mode, setTheme, setMode, themes, installTheme, removeTheme }`

### Theme Installer (`src/renderer/src/lib/theme-installer.ts`)

Function `installThemeFromUrl(url: string): Promise<ThemeDefinition>`:
1. Fetch the URL (handle CORS — tweakcn.com serves JSON with proper headers)
2. Parse the JSON
3. Validate it has `name` and `cssVars` with `light` and `dark`
4. Convert to `ThemeDefinition`:
   - `id` = `name` from JSON
   - `name` = prettify the name (replace hyphens with spaces, title case)
   - `source` = the URL
   - `isBuiltIn` = false
   - `cssVars` = extracted from JSON
   - `installedAt` = Date.now()
5. Return the definition (caller adds to store)

Also support pasting raw JSON (detect if input starts with `{`).

## UI

### Settings Page (`src/renderer/src/components/settings/Settings.tsx`)

Add a new "Settings" view to the Shell (alongside 'home' and 'theme'). The sidebar gets a Settings nav item (gear icon).

The Settings page has a left nav with sections. Start with just "Appearance":

#### Appearance Section (`src/renderer/src/components/settings/AppearanceSettings.tsx`)

Layout:
```
┌──────────────────────────────────────────────────────┐
│  Appearance                                          │
│                                                      │
│  Mode                                                │
│  ┌────────┐ ┌────────┐ ┌────────┐                   │
│  │  Light │ │  Dark  │ │ System │                   │
│  └────────┘ └────────┘ └────────┘                   │
│                                                      │
│  Theme                                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│  │ mini     │ │ mini     │ │ mini     │             │
│  │ preview  │ │ preview  │ │ preview  │             │
│  │          │ │          │ │          │             │
│  │ Default  │ │ Amber    │ │ + Add   │             │
│  │    ✓     │ │ Minimal  │ │  Theme   │             │
│  └──────────┘ └──────────┘ └──────────┘             │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Mode Selector**: Three toggle buttons (Light / Dark / System). Updates `mode` in theme store.

**Theme Grid**: Cards showing each installed theme. Each card:
- A mini preview showing the theme colors (colored bars/circles for bg, primary, secondary, accent, muted — compact visual representation)
- Theme name below
- Checkmark on the active theme
- Click to activate
- Right-click or hover action for non-built-in themes: "Remove"

**Add Theme Card**: A dashed-border card with a "+" icon. Click opens a dialog:
- Input field: "Paste a tweakcn.com theme URL"
- Placeholder: `https://tweakcn.com/r/themes/...`  
- Also accepts raw JSON
- "Install" button — fetches, parses, adds to store, auto-activates
- Loading state while fetching
- Error state if invalid

### Install Theme Dialog (`src/renderer/src/components/settings/InstallThemeDialog.tsx`)

Uses shadcn Dialog + Input + Button. States: idle, loading, error, success (auto-closes).

### Theme Preview Card (`src/renderer/src/components/settings/ThemePreviewCard.tsx`)

A compact card showing:
- 5 color swatches in a row (background, primary, secondary, accent, destructive) from the theme's dark mode vars
- Theme name
- Selected indicator (ring/checkmark)
- Optional remove button (for non-built-in)

## Integration Points

### App.tsx Changes

- Remove hardcoded `className="dark"` from the root div
- Add `useTheme()` hook call (it handles applying the theme)
- The hook manages the `dark` class on `<html>` based on mode

### Shell.tsx Changes

- Add 'settings' to the View union type
- Render `<Settings />` when view is 'settings'

### Sidebar.tsx Changes  

- Add Settings nav item with gear icon
- Update View type to include 'settings'

### globals.css

- Keep as-is — it serves as the "Default" theme baseline
- The theme applier overrides vars with inline styles when a non-default theme is active

## Pre-installed Themes

Ship with two themes out of the box:
1. **Default** (built-in, from current globals.css) — cannot be removed
2. **Amber Minimal** (pre-installed from tweakcn) — can be removed

The Amber Minimal theme data should be hardcoded in `src/renderer/src/lib/built-in-themes.ts` so it's available without network. Extracted from: `https://tweakcn.com/r/themes/amber-minimal.json`

## Execution Rules

1. Before starting each phase, re-read this SPEC to refresh your goals.
2. Maintain a `progress.md` in `/Users/aneyman/bot/openclaw/kos/`:
   - After each phase: what you did, files changed, decisions made
   - Any errors hit and how you resolved them
   - What's next
3. If an approach fails twice, try a different method.
4. After every 2 research/exploration actions, write findings to progress.md before continuing.
5. Commit after initial changes with "wip: multi-theme support" message.

## File Summary

New files:
- `src/renderer/src/types/theme.ts`
- `src/renderer/src/stores/theme-store.ts`
- `src/renderer/src/lib/theme-applier.ts`
- `src/renderer/src/lib/theme-installer.ts`
- `src/renderer/src/lib/built-in-themes.ts`
- `src/renderer/src/hooks/use-theme.ts`
- `src/renderer/src/components/settings/Settings.tsx`
- `src/renderer/src/components/settings/AppearanceSettings.tsx`
- `src/renderer/src/components/settings/ThemePreviewCard.tsx`
- `src/renderer/src/components/settings/InstallThemeDialog.tsx`

Modified files:
- `src/renderer/src/types/index.ts` (add theme export)
- `src/renderer/src/App.tsx` (use theme hook, remove hardcoded dark class)
- `src/renderer/src/components/layout/Shell.tsx` (add settings view)
- `src/renderer/src/components/layout/Sidebar.tsx` (add settings nav)
