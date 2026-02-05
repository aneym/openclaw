import { Volume2 } from "lucide-react";
import { BUILT_IN_SOUNDS, previewSound } from "../../lib/notification-sounds";
import { useNotificationStore } from "../../stores/notification-store";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Slider } from "../ui/slider";
import { Switch } from "../ui/switch";

const isMac = navigator.platform.startsWith("Mac");

export function NotificationSettings() {
  const soundEnabled = useNotificationStore((s) => s.soundEnabled);
  const soundId = useNotificationStore((s) => s.soundId);
  const soundVolume = useNotificationStore((s) => s.soundVolume);
  const dockBadgeEnabled = useNotificationStore((s) => s.dockBadgeEnabled);
  const setSoundEnabled = useNotificationStore((s) => s.setSoundEnabled);
  const setSoundId = useNotificationStore((s) => s.setSoundId);
  const setSoundVolume = useNotificationStore((s) => s.setSoundVolume);
  const setDockBadgeEnabled = useNotificationStore((s) => s.setDockBadgeEnabled);

  return (
    <div className="space-y-6">
      {/* Sound enabled toggle */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="sound-enabled">Notification sounds</Label>
          <p className="text-sm text-muted-foreground">
            Play a sound when a chat completes in the background
          </p>
        </div>
        <Switch id="sound-enabled" checked={soundEnabled} onCheckedChange={setSoundEnabled} />
      </div>

      {/* Sound selector + preview */}
      <div className="space-y-2">
        <Label>Sound</Label>
        <div className="flex items-center gap-2">
          <Select value={soundId} onValueChange={setSoundId} disabled={!soundEnabled}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BUILT_IN_SOUNDS.map((sound) => (
                <SelectItem key={sound.id} value={sound.id}>
                  {sound.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            disabled={!soundEnabled}
            onClick={() => previewSound(soundId, soundVolume)}
          >
            <Volume2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Volume slider */}
      <div className="space-y-2">
        <Label>Volume</Label>
        <div className="flex items-center gap-4">
          <Slider
            value={[Math.round(soundVolume * 100)]}
            onValueChange={([v]) => setSoundVolume(v / 100)}
            min={0}
            max={100}
            step={1}
            disabled={!soundEnabled}
            className="flex-1"
          />
          <span className="text-sm text-muted-foreground w-8 text-right">
            {Math.round(soundVolume * 100)}
          </span>
        </div>
      </div>

      {/* Dock badge toggle (macOS only) */}
      {isMac && (
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="dock-badge">Dock badge</Label>
            <p className="text-sm text-muted-foreground">Show unread count on the dock icon</p>
          </div>
          <Switch
            id="dock-badge"
            checked={dockBadgeEnabled}
            onCheckedChange={setDockBadgeEnabled}
          />
        </div>
      )}
    </div>
  );
}
