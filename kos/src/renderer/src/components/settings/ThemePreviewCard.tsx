import { Check, X } from 'lucide-react'
import type { ThemeDefinition } from '../../types'

interface ThemePreviewCardProps {
  theme: ThemeDefinition
  isActive: boolean
  resolvedMode: 'light' | 'dark'
  onSelect: () => void
  onRemove?: () => void
}

function getColor(theme: ThemeDefinition, key: string, mode: 'light' | 'dark'): string {
  const modeVars = mode === 'dark' ? theme.cssVars.dark : theme.cssVars.light
  return modeVars[key] ?? 'transparent'
}

export function ThemePreviewCard({
  theme,
  isActive,
  resolvedMode,
  onSelect,
  onRemove
}: ThemePreviewCardProps) {
  const bg = getColor(theme, 'background', resolvedMode)
  const fg = getColor(theme, 'foreground', resolvedMode)
  const primary = getColor(theme, 'primary', resolvedMode)
  const muted = getColor(theme, 'muted', resolvedMode)
  const accent = getColor(theme, 'accent', resolvedMode)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={`group relative flex flex-col rounded-lg border-2 overflow-hidden transition-all hover:shadow-md cursor-pointer ${
        isActive
          ? 'border-primary ring-2 ring-primary/20'
          : 'border-border hover:border-muted-foreground/30'
      }`}
    >
      {/* Mini UI preview */}
      <div className="p-2.5 h-20" style={{ backgroundColor: bg }}>
        {/* Fake sidebar + content area */}
        <div className="flex gap-1.5 h-full rounded-md overflow-hidden">
          {/* Sidebar */}
          <div className="w-8 rounded-sm p-1 flex flex-col gap-1" style={{ backgroundColor: muted }}>
            <div className="h-1.5 w-full rounded-full" style={{ backgroundColor: primary }} />
            <div className="h-1.5 w-full rounded-full opacity-40" style={{ backgroundColor: fg }} />
            <div className="h-1.5 w-full rounded-full opacity-40" style={{ backgroundColor: fg }} />
          </div>
          {/* Content */}
          <div className="flex-1 rounded-sm p-1.5 flex flex-col gap-1" style={{ backgroundColor: accent }}>
            <div className="h-1.5 w-3/4 rounded-full opacity-60" style={{ backgroundColor: fg }} />
            <div className="h-1.5 w-1/2 rounded-full opacity-40" style={{ backgroundColor: fg }} />
            <div className="mt-auto h-3 w-10 rounded-sm" style={{ backgroundColor: primary }} />
          </div>
        </div>
      </div>

      {/* Theme name */}
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-sm font-medium truncate">{theme.name}</span>
        {isActive && <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
      </div>

      {/* Remove button for non-built-in themes */}
      {onRemove && !theme.isBuiltIn && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
          title="Remove theme"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
