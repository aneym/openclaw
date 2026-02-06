import { MessageSquare, Globe, Hash, Timer, type LucideIcon } from "lucide-react";

/**
 * Map of channel identifiers to lucide-react icon components.
 * Channels are derived from OpenClaw session `channel` field.
 */
const CHANNEL_ICONS: Record<string, LucideIcon> = {
  // Messaging platforms
  slack: MessageSquare,
  telegram: MessageSquare,
  discord: Hash,
  whatsapp: MessageSquare,
  signal: MessageSquare,
  imessage: MessageSquare,

  // Web/UI channels
  webchat: Globe,
  kos: Globe,

  // Automated
  cron: Timer,

  // Extensions
  msteams: MessageSquare,
  matrix: Hash,
  zalo: MessageSquare,
};

const CHANNEL_LABELS: Record<string, string> = {
  slack: "Slack",
  telegram: "Telegram",
  discord: "Discord",
  whatsapp: "WhatsApp",
  signal: "Signal",
  imessage: "iMessage",
  webchat: "Web",
  kos: "kOS",
  cron: "Cron",
  msteams: "Teams",
  matrix: "Matrix",
  zalo: "Zalo",
};

/** Renders the appropriate icon for a channel */
export function ChannelIcon({
  channel,
  className,
  showLabel = false,
}: {
  channel?: string;
  className?: string;
  showLabel?: boolean;
}) {
  const normalized = channel?.toLowerCase().trim();
  const IconComponent = normalized ? CHANNEL_ICONS[normalized] : undefined;
  const label = normalized ? CHANNEL_LABELS[normalized] : undefined;

  if (showLabel && label) {
    return (
      <span className="inline-flex items-center gap-1">
        {IconComponent ? (
          <IconComponent className={className} />
        ) : (
          <MessageSquare className={className} />
        )}
        <span>{label}</span>
      </span>
    );
  }

  if (IconComponent) {
    return <IconComponent className={className} />;
  }
  return <MessageSquare className={className} />;
}
