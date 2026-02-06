/**
 * Profile represents a top-level identity/context that isolates:
 * - Gateway connection (different OpenClaw instance)
 * - Integration tokens (GitHub, Linear)
 * - Projects (isolated per profile)
 * - Chats/Sessions (isolated per profile)
 */
export interface Profile {
  id: string;
  name: string;
  icon?: string; // Emoji for quick recognition
  color?: string; // Accent color (hex)

  // Gateway connection
  gatewayUrl: string;
  gatewayToken?: string;

  // Integration tokens (per-profile)
  linearApiKey?: string;
  linearTeamId?: string;
  githubToken?: string;

  // Metadata
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_PROFILE_ID = "work";
export const DEFAULT_GATEWAY_PORT = import.meta.env.DEV ? 19001 : 18789;
export const DEFAULT_GATEWAY_URL = `ws://localhost:${DEFAULT_GATEWAY_PORT}`;

export function createDefaultProfile(): Profile {
  const now = Date.now();
  return {
    id: DEFAULT_PROFILE_ID,
    name: "Work",
    icon: "briefcase",
    color: "#3b82f6", // Blue
    gatewayUrl: DEFAULT_GATEWAY_URL,
    isDefault: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function createPersonalProfile(): Profile {
  const now = Date.now();
  return {
    id: "personal",
    name: "Personal",
    icon: "user",
    color: "#22c55e", // Green
    gatewayUrl: DEFAULT_GATEWAY_URL,
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  };
}
