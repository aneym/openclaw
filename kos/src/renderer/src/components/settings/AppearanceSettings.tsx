import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../../hooks/use-theme';
import { ThemePreviewCard } from './ThemePreviewCard';
import { InstallThemeDialog } from './InstallThemeDialog';

const modeOptions = [
  { value: 'light' as const, label: 'Light', icon: Sun },
  { value: 'dark' as const, label: 'Dark', icon: Moon },
  { value: 'system' as const, label: 'System', icon: Monitor },
];

export function AppearanceSettings() {
  const { themes, theme: activeTheme, mode, setTheme, setMode, removeTheme } = useTheme();

  return (
    <div className="space-y-8">
      {/* Mode selector */}
      <div>
        <h3 className="text-sm font-medium mb-3">Mode</h3>
        <div className="flex gap-2">
          {modeOptions.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setMode(value)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors border ${
                mode === value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Theme grid */}
      <div>
        <h3 className="text-sm font-medium mb-3">Theme</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {themes.map((t) => (
            <ThemePreviewCard
              key={t.id}
              theme={t}
              isActive={activeTheme?.id === t.id}
              onSelect={() => setTheme(t.id)}
              onRemove={t.isBuiltIn ? undefined : () => removeTheme(t.id)}
            />
          ))}
          <InstallThemeDialog />
        </div>
      </div>
    </div>
  );
}
