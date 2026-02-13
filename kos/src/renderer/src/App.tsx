import { useEffect, useRef } from "react";
import { Shell } from "./components/layout/Shell";
import { Toaster } from "./components/ui/sonner";
import { useAgentSync } from "./hooks/use-agent-sync";
import { useApprovalSync } from "./hooks/use-approval-sync";
import { useSessionSync } from "./hooks/use-session-sync";
import { useSubagentSync } from "./hooks/use-subagent-sync";
import { useTheme } from "./hooks/use-theme";
import { useTriageBridge } from "./hooks/use-triage-bridge";
import { klog } from "./lib/klog";
import { useGatewayStore } from "./stores/gateway-store";
import { useActiveProfile, useActiveProfileId } from "./stores/profile-store";
import { useProjectStore } from "./stores/project-store";
import { useThemeStore } from "./stores/theme-store";
import {
  DEFAULT_GATEWAY_URL,
  resolveGatewayConnection,
  resolveGatewayLaunchConnection,
} from "./types/profile";
import "./styles/globals.css";

function App() {
  // Gateway state
  const connect = useGatewayStore((s) => s.connect);
  const disconnect = useGatewayStore((s) => s.disconnect);
  const connected = useGatewayStore((s) => s.connected);
  const client = useGatewayStore((s) => s.client);

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
  useAgentSync();
  useSubagentSync();
  useApprovalSync();
  useTriageBridge();

  // Toggle .liquid-glass class + apply glass tuning vars on <html>
  const liquidGlass = useThemeStore((s) => s.liquidGlass);
  const glass = useThemeStore((s) => s.glass);
  const themeMode = useThemeStore((s) => s.mode);
  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle("liquid-glass", liquidGlass);
    if (liquidGlass) {
      const ct = glass.chromeTint / 100;
      const st = glass.sidebarTint / 100;
      el.style.setProperty("--glass-chrome-tint", String(ct));
      el.style.setProperty("--glass-sidebar-tint", String(st));
      el.style.setProperty("--glass-border-opacity", String(glass.borderOpacity / 100));
      // Compute glass backgrounds directly — Chromium doesn't reliably
      // re-evaluate rgba() when only a nested var() changes via inline style
      const isDark = el.classList.contains("dark");
      if (isDark) {
        el.style.setProperty("--glass-chrome-bg", `rgba(0, 0, 0, ${ct * 2})`);
        el.style.setProperty("--glass-sidebar-bg", `rgba(0, 0, 0, ${st * 2})`);
      } else {
        el.style.setProperty("--glass-chrome-bg", `rgba(255, 255, 255, ${ct})`);
        el.style.setProperty("--glass-sidebar-bg", `rgba(255, 255, 255, ${st})`);
      }
    } else {
      // Clean up inline overrides so CSS fallbacks take over
      for (const prop of [
        "--glass-chrome-tint",
        "--glass-sidebar-tint",
        "--glass-border-opacity",
        "--glass-chrome-bg",
        "--glass-sidebar-bg",
      ]) {
        el.style.removeProperty(prop);
      }
    }
  }, [liquidGlass, glass, themeMode]);
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

    // Skip if already connected or actively connecting (unless profile changed).
    // Fast Refresh/HMR can reset Zustand stores while leaving the renderer alive;
    // make sure we attempt a (re)connect when disconnected and no client exists.
    if ((connected || client) && !isProfileSwitch) {
      return;
    }

    // Use profile's gateway URL/token, merging with Electron IPC config for missing token
    const { gatewayUrl: profileGatewayUrl, gatewayToken: profileGatewayToken } =
      resolveGatewayConnection({
        gatewayUrl: activeProfile?.gatewayUrl,
        gatewayToken: activeProfile?.gatewayToken,
      });
    const { gatewayUrl: launchGatewayUrl, gatewayToken: launchGatewayToken } =
      resolveGatewayLaunchConnection(window.location);

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
        // Avoid late async resolution racing with an already-established connection.
        const { connected: nowConnected, client: nowClient } = useGatewayStore.getState();
        if (nowConnected || nowClient) {
          return;
        }
        const url = profileGatewayUrl || launchGatewayUrl || config.url || DEFAULT_GATEWAY_URL;
        const token = profileGatewayToken || launchGatewayToken || config.token;
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
      const url = profileGatewayUrl || launchGatewayUrl || DEFAULT_GATEWAY_URL;
      const token = profileGatewayToken || launchGatewayToken;
      klog.gateway("Connecting to gateway (web fallback)", {
        url,
        hasToken: !!token,
      });
      connect(url, token, "web-fallback");
    }
  }, [activeProfile, activeProfileId, client, connect, connected, disconnect, resetForProfile]);

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Shell />
      <Toaster />
    </div>
  );
}

export default App;
