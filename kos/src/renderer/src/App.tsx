import { useEffect } from "react";
import { Shell } from "./components/layout/Shell";
import { Toaster } from "./components/ui/sonner";
import { useSessionSync } from "./hooks/use-session-sync";
import { useTheme } from "./hooks/use-theme";
import { useGatewayStore } from "./stores/gateway-store";
import { useWorkspaceStore } from "./stores/workspace-store";
import "./styles/globals.css";

function App() {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const updateWorkspace = useWorkspaceStore((s) => s.updateWorkspace);
  const connect = useGatewayStore((s) => s.connect);

  // Initialize theme system — applies CSS vars and dark/light class on <html>
  useTheme();
  useSessionSync();

  // Auto-discover gateway config from OpenClaw config on first launch
  useEffect(() => {
    if (!activeWorkspace) return;

    // If the workspace already has a token, no need to discover
    if (activeWorkspace.gatewayToken) return;

    if (window.api?.getGatewayConfig) {
      window.api.getGatewayConfig().then((config) => {
        if (config.token || config.url !== activeWorkspace.gatewayUrl) {
          updateWorkspace(activeWorkspace.id, {
            gatewayUrl: config.url,
            gatewayToken: config.token,
          });
        }
      });
    }
  }, [activeWorkspace?.id]);

  // Connect to gateway when workspace config is ready
  // Use a small delay to handle React strict mode double-mount
  useEffect(() => {
    if (!activeWorkspace?.gatewayUrl) return;

    const timer = setTimeout(() => {
      connect(activeWorkspace.gatewayUrl, activeWorkspace.gatewayToken);
    }, 50);

    return () => clearTimeout(timer);
  }, [activeWorkspace?.gatewayUrl, activeWorkspace?.gatewayToken, connect]);

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Shell />
      <Toaster />
    </div>
  );
}

export default App;
