import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "../../hooks/use-theme";
import { resolveMode } from "../../lib/theme-applier";
import { useThemeStore } from "../../stores/theme-store";
import { Label } from "../ui/label";
import { Slider } from "../ui/slider";
import { Switch } from "../ui/switch";
import { InstallThemeDialog } from "./InstallThemeDialog";
import { ThemePreviewCard } from "./ThemePreviewCard";

function GlassSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="text-xs tabular-nums text-muted-foreground">{value}%</span>
      </div>
      <Slider min={0} max={100} step={1} value={[value]} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}

const modeOptions = [
  { value: "light" as const, label: "Light", icon: Sun },
  { value: "dark" as const, label: "Dark", icon: Moon },
  { value: "system" as const, label: "System", icon: Monitor },
];

export function AppearanceSettings() {
  const { themes, theme: activeTheme, mode, setTheme, setMode, removeTheme } = useTheme();
  const resolved = resolveMode(mode);

  const liquidGlass = useThemeStore((s) => s.liquidGlass);
  const setLiquidGlass = useThemeStore((s) => s.setLiquidGlass);
  const glass = useThemeStore((s) => s.glass);
  const setGlass = useThemeStore((s) => s.setGlass);

  return (
    <div className="space-y-6">
      {/* Liquid Glass toggle (macOS only) */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="liquid-glass">Liquid Glass</Label>
          <p className="text-xs text-muted-foreground">
            Use native macOS glass material for chrome surfaces
          </p>
        </div>
        <Switch id="liquid-glass" checked={liquidGlass} onCheckedChange={setLiquidGlass} />
      </div>

      {liquidGlass && (
        <div className="space-y-4 pl-1">
          <GlassSlider
            label="Chrome tint"
            value={glass.chromeTint}
            onChange={(v) => setGlass({ chromeTint: v })}
          />
          <GlassSlider
            label="Sidebar tint"
            value={glass.sidebarTint}
            onChange={(v) => setGlass({ sidebarTint: v })}
          />
          <GlassSlider
            label="Border opacity"
            value={glass.borderOpacity}
            onChange={(v) => setGlass({ borderOpacity: v })}
          />
        </div>
      )}

      {/* Mode toggle — segmented control */}
      <div className="inline-flex rounded-lg bg-muted p-1 gap-1">
        {modeOptions.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setMode(value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
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
  );
}
