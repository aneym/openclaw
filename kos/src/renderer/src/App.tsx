import { useEffect } from "react";
import { Shell } from "./components/layout/Shell";
import { Toaster } from "./components/ui/sonner";
import { useSessionSync } from "./hooks/use-session-sync";
import { useTheme } from "./hooks/use-theme";
import { useGatewayStore } from "./stores/gateway-store";
import "./styles/globals.css";

// Default gateway URL for local development
const DEFAULT_GATEWAY_URL = "ws://localhost:18789";

function App() {
  // Gateway state
  const connect = useGatewayStore((s) => s.connect);
  const connected = useGatewayStore((s) => s.connected);

  // Initialize theme system — applies CSS vars and dark/light class on <html>
  useTheme();
  useSessionSync();

  // Connect to gateway on startup
  // TODO: Get gateway URL/token from settings
  useEffect(() => {
    // Only connect once on initial mount
    if (connected) return;

    // Try to get gateway config from Electron API if available
    if (window.api?.getGatewayConfig) {
      window.api.getGatewayConfig().then((config) => {
        connect(config.url || DEFAULT_GATEWAY_URL, config.token);
      });
    } else {
      // Fallback for web preview or when API is unavailable
      connect(DEFAULT_GATEWAY_URL, undefined);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Shell />
      <Toaster />
    </div>
  );
}

export default App;
