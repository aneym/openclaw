import { useEffect, useRef } from "react";
import { Shell } from "./components/layout/Shell";
import { Toaster } from "./components/ui/sonner";
import { useSessionSync } from "./hooks/use-session-sync";
import { useTheme } from "./hooks/use-theme";
import { klog } from "./lib/klog";
import { useGatewayStore } from "./stores/gateway-store";
import { useActiveProfile, useActiveProfileId } from "./stores/profile-store";
import { useProjectStore } from "./stores/project-store";
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

    // Use profile's gateway URL if available, otherwise fall back to Electron config
    const profileGatewayUrl = activeProfile?.gatewayUrl;
    const profileGatewayToken = activeProfile?.gatewayToken;

    if (profileGatewayUrl) {
      klog.gateway("Connecting to gateway (profile)", {
        url: profileGatewayUrl,
        hasToken: !!profileGatewayToken,
        profileId: activeProfileId,
      });
      connect(profileGatewayUrl, profileGatewayToken, `profile:${activeProfileId}`);
    } else if (window.api?.getGatewayConfig) {
      window.api.getGatewayConfig().then((config) => {
        const url = config.url || DEFAULT_GATEWAY_URL;
        klog.gateway("Connecting to gateway", {
          url,
          hasToken: !!config.token,
          source: config.source,
        });
        connect(url, config.token, config.source);
      });
    } else {
      // Fallback for web preview or when API is unavailable
      klog.gateway("Connecting to gateway (web fallback)", {
        url: DEFAULT_GATEWAY_URL,
        hasToken: false,
      });
      connect(DEFAULT_GATEWAY_URL, undefined, "web-fallback");
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
