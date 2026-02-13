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
export const DEFAULT_GATEWAY_PORT = 18789;
export const DEFAULT_GATEWAY_URL = `ws://localhost:${DEFAULT_GATEWAY_PORT}`;
export const LEGACY_DEV_GATEWAY_PORT = 19001;
export const LEGACY_DEV_GATEWAY_URL = `ws://localhost:${LEGACY_DEV_GATEWAY_PORT}`;

export function resolveGatewayConnection(params: {
  gatewayUrl?: string | null;
  gatewayToken?: string | null;
}): {
  gatewayUrl: string;
  gatewayToken?: string;
} {
  const fallbackUrl =
    typeof params.gatewayUrl === "string" && params.gatewayUrl.trim()
      ? params.gatewayUrl.trim()
      : DEFAULT_GATEWAY_URL;
  const explicitToken =
    typeof params.gatewayToken === "string" && params.gatewayToken.trim()
      ? params.gatewayToken.trim()
      : undefined;

  let parsed: URL;
  try {
    parsed = new URL(fallbackUrl);
  } catch {
    return { gatewayUrl: fallbackUrl, gatewayToken: explicitToken };
  }

  const hashRaw = parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash;
  const hashParams = new URLSearchParams(hashRaw);
  const tokenFromUrl = (parsed.searchParams.get("token") ?? hashParams.get("token") ?? "").trim();

  parsed.searchParams.delete("token");
  hashParams.delete("token");

  const nextHash = hashParams.toString();
  parsed.hash = nextHash ? `#${nextHash}` : "";

  const base = `${parsed.protocol}//${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  const cleanedGatewayUrl = `${base}${parsed.search}${parsed.hash}`;

  return {
    gatewayUrl: cleanedGatewayUrl,
    gatewayToken: explicitToken || tokenFromUrl || undefined,
  };
}

type BrowserLocationLike = {
  search?: string;
  hash?: string;
};

function getLaunchParam(search: URLSearchParams, hash: URLSearchParams, keys: string[]): string {
  for (const key of keys) {
    const fromSearch = search.get(key);
    if (fromSearch) {
      return fromSearch.trim();
    }
    const fromHash = hash.get(key);
    if (fromHash) {
      return fromHash.trim();
    }
  }
  return "";
}

export function resolveGatewayLaunchConnection(
  locationLike: BrowserLocationLike | null | undefined,
): {
  gatewayUrl?: string;
  gatewayToken?: string;
} {
  if (!locationLike) {
    return {};
  }

  const search = new URLSearchParams(locationLike.search ?? "");
  const hashRaw = locationLike.hash?.startsWith("#")
    ? locationLike.hash.slice(1)
    : (locationLike.hash ?? "");
  const hash = new URLSearchParams(hashRaw);

  const launchGateway = getLaunchParam(search, hash, ["gateway", "gatewayUrl"]);
  const launchToken = getLaunchParam(search, hash, ["token"]);

  if (!launchGateway && !launchToken) {
    return {};
  }

  const normalized = resolveGatewayConnection({
    gatewayUrl: launchGateway || DEFAULT_GATEWAY_URL,
    gatewayToken: launchToken || undefined,
  });
  return normalized;
}

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
