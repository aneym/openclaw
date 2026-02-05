import { useEffect, useRef } from "react";
import { Shell } from "./components/layout/Shell";
import { Toaster } from "./components/ui/sonner";
import { useSessionSync } from "./hooks/use-session-sync";
import { useTheme } from "./hooks/use-theme";
import { klog } from "./lib/klog";
import { useGatewayStore } from "./stores/gateway-store";
import { useActiveProfile, useActiveProfileId } from "./stores/profile-store";
import { useProjectStore } from "./stores/project-store";
import { useThemeStore } from "./stores/theme-store";
import "./styles/globals.css";

// Default gateway URL for local development
const DEFAULT_GATEWAY_URL = "ws://localhost:19001";

function App() {
  // Gateway state
  const connect = useGatewayStore((s) => s.connect);
  const disconnect = useGatewayStore((s) => s.disconnect);
  const connected = useGatewayStore((s) => s.connected);

  // Debug: log when connected state changes
  useEffect(() => {
    console.log("[App] Gateway connected state changed:", connected);
  }, [connected]);

  // Profile state
  const activeProfile = useActiveProfile();
  const activeProfileId = useActiveProfileId();
  const prevProfileIdRef = useRef<string | null>(null);

  // Project state - for resetting on profile change
  const resetForProfile = useProjectStore((s) => s.resetForProfile);

  // Initialize theme system — applies CSS vars and dark/light class on <html>
  useTheme();
  useSessionSync();

  // Toggle .liquid-glass class + apply glass tuning vars on <html>
  const liquidGlass = useThemeStore((s) => s.liquidGlass);
  const glass = useThemeStore((s) => s.glass);
  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle("liquid-glass", liquidGlass);
    if (liquidGlass) {
      el.style.setProperty("--glass-chrome-tint", String(glass.chromeTint / 100));
      el.style.setProperty("--glass-sidebar-tint", String(glass.sidebarTint / 100));
      el.style.setProperty("--glass-border-opacity", String(glass.borderOpacity / 100));
    }
  }, [liquidGlass, glass]);
  // Note: Abort retry is now handled internally by useChatSession per-session

  // Connect to gateway on startup and reconnect on profile change
  useEffect(() => {
    const isProfileSwitch =
      prevProfileIdRef.current !== null && prevProfileIdRef.current !== activeProfileId;
    prevProfileIdRef.current = activeProfileId;

    // On profile switch, disconnect and reconnect
    if (isProfileSwitch) {
      klog.gateway("Profile changed, reconnecting", { profileId: activeProfileId });
      disconnect();
      // Reset project store for new profile
      resetForProfile(activeProfileId);
    }

    // Skip if already connected (unless profile changed)
    if (connected && !isProfileSwitch) return;

    // Use profile's gateway URL/token, merging with Electron IPC config for missing token
    const profileGatewayUrl = activeProfile?.gatewayUrl;
    const profileGatewayToken = activeProfile?.gatewayToken;

    if (profileGatewayToken && profileGatewayUrl) {
      // Profile has both URL and token — use directly
      klog.gateway("Connecting to gateway (profile)", {
        url: profileGatewayUrl,
        hasToken: true,
        profileId: activeProfileId,
      });
      connect(profileGatewayUrl, profileGatewayToken, `profile:${activeProfileId}`);
    } else if (window.api?.getGatewayConfig) {
      // Read token from Electron config (openclaw.json), use profile URL if set
      window.api.getGatewayConfig().then((config) => {
        const url = profileGatewayUrl || config.url || DEFAULT_GATEWAY_URL;
        const token = config.token;
        klog.gateway("Connecting to gateway", {
          url,
          hasToken: !!token,
          source: config.source,
          profileId: activeProfileId,
        });
        connect(url, token, config.source);
      });
    } else {
      // Fallback for web preview or when API is unavailable
      const url = profileGatewayUrl || DEFAULT_GATEWAY_URL;
      klog.gateway("Connecting to gateway (web fallback)", {
        url,
        hasToken: false,
      });
      connect(url, undefined, "web-fallback");
    }
  }, [activeProfileId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Shell />
      <Toaster />
    </div>
  );
}

export default App;
