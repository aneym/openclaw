import { Briefcase, Code, Folder, Heart, Home, Rocket, Star, Zap } from "lucide-react";
import { useState } from "react";
import { ProjectIcon } from "../../lib/project-icons";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

// Common emojis for projects
const EMOJIS = [
  "📁",
  "💼",
  "🚀",
  "⚡",
  "💡",
  "🎯",
  "🔥",
  "✨",
  "💰",
  "🔗",
  "🤖",
  "💒",
  "📱",
  "🎨",
  "🔧",
  "📊",
  "🌟",
  "💎",
  "🎮",
  "📚",
  "🏠",
  "💻",
  "🛠️",
  "🎵",
];

// Lucide icon options
const LUCIDE_ICONS = [
  { key: "folder", icon: Folder },
  { key: "briefcase", icon: Briefcase },
  { key: "code", icon: Code },
  { key: "rocket", icon: Rocket },
  { key: "star", icon: Star },
  { key: "zap", icon: Zap },
  { key: "heart", icon: Heart },
  { key: "home", icon: Home },
];

interface IconPickerProps {
  value?: string;
  onChange: (icon: string) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [open, setOpen] = useState(false);

  const handleSelect = (icon: string) => {
    onChange(icon);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-12 h-12 p-0 text-xl" type="button">
          <ProjectIcon icon={value || "folder"} size="lg" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <div className="space-y-4">
          {/* Emoji section */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Emojis</div>
            <div className="grid grid-cols-8 gap-1">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleSelect(emoji)}
                  className={`w-8 h-8 flex items-center justify-center rounded hover:bg-accent text-lg ${
                    value === emoji ? "bg-accent" : ""
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Lucide icons section */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Icons</div>
            <div className="grid grid-cols-8 gap-1">
              {LUCIDE_ICONS.map(({ key, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => handleSelect(key)}
                  className={`w-8 h-8 flex items-center justify-center rounded hover:bg-accent ${
                    value === key ? "bg-accent" : ""
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
