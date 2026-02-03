import { Check, X } from 'lucide-react';
import type { ThemeDefinition } from '../../types';

interface ThemePreviewCardProps {
  theme: ThemeDefinition;
  isActive: boolean;
  onSelect: () => void;
  onRemove?: () => void;
}

/**
 * Extract a raw color value from a theme's dark-mode vars.
 * Falls back to light if dark doesn't have it.
 */
function getColor(theme: ThemeDefinition, key: string): string {
  return theme.cssVars.dark[key] ?? theme.cssVars.light[key] ?? 'transparent';
}

export function ThemePreviewCard({
  theme,
  isActive,
  onSelect,
  onRemove,
}: ThemePreviewCardProps) {
  const swatches = [
    { key: 'background', label: 'BG' },
    { key: 'primary', label: 'Pri' },
    { key: 'secondary', label: 'Sec' },
    { key: 'accent', label: 'Acc' },
    { key: 'destructive', label: 'Des' },
  ];

  return (
    <button
      onClick={onSelect}
      className={`group relative flex flex-col rounded-lg border-2 p-3 text-left transition-all hover:shadow-md ${
        isActive
          ? 'border-primary ring-2 ring-primary/20'
          : 'border-border hover:border-muted-foreground/30'
      }`}
    >
      {/* Color swatches */}
      <div className="flex gap-1.5 mb-3">
        {swatches.map(({ key }) => (
          <div
            key={key}
            className="h-6 w-6 rounded-full border border-border/50"
            style={{ backgroundColor: getColor(theme, key) }}
          />
        ))}
      </div>

      {/* Theme name */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium truncate">{theme.name}</span>
        {isActive && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
      </div>

      {/* Remove button for non-built-in themes */}
      {onRemove && !theme.isBuiltIn && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
          title="Remove theme"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </button>
  );
}
