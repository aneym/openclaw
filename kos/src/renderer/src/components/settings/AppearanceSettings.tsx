import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from '../../hooks/use-theme'
import { resolveMode } from '../../lib/theme-applier'
import { ThemePreviewCard } from './ThemePreviewCard'
import { InstallThemeDialog } from './InstallThemeDialog'

const modeOptions = [
  { value: 'light' as const, label: 'Light', icon: Sun },
  { value: 'dark' as const, label: 'Dark', icon: Moon },
  { value: 'system' as const, label: 'System', icon: Monitor }
]

export function AppearanceSettings() {
  const { themes, theme: activeTheme, mode, setTheme, setMode, removeTheme } = useTheme()
  const resolved = resolveMode(mode)

  return (
    <div className="space-y-6">
      {/* Mode toggle — segmented control */}
      <div className="inline-flex rounded-lg bg-muted p-1 gap-1">
        {modeOptions.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setMode(value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Theme grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {themes.map((t) => (
          <ThemePreviewCard
            key={t.id}
            theme={t}
            isActive={activeTheme?.id === t.id}
            resolvedMode={resolved}
            onSelect={() => setTheme(t.id)}
            onRemove={t.isBuiltIn ? undefined : () => removeTheme(t.id)}
          />
        ))}
        <InstallThemeDialog />
      </div>
    </div>
  )
}
