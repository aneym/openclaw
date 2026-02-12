type FileUrlOptions = {
  gatewayUrl?: string | null;
  token?: string | null;
  password?: string | null;
};

function resolveDefaultOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "http://localhost";
}

function normalizeGatewayHttpBase(gatewayUrl?: string | null): string {
  const fallback = resolveDefaultOrigin();
  const raw = gatewayUrl?.trim();
  if (!raw) {
    return fallback;
  }

  try {
    const url = new URL(raw, fallback);
    if (url.protocol === "ws:") {
      url.protocol = "http:";
    } else if (url.protocol === "wss:") {
      url.protocol = "https:";
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return fallback;
    }
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return fallback;
  }
}

export function useFileUrl(filePath: string, opts: FileUrlOptions = {}): string {
  const base = normalizeGatewayHttpBase(opts.gatewayUrl);
  const url = new URL("/api/files", base);
  url.searchParams.set("path", filePath);
  const authToken = opts.token?.trim() || opts.password?.trim();
  if (authToken) {
    url.searchParams.set("token", authToken);
  }
  return url.toString();
}
