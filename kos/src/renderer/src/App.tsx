import { useEffect } from 'react';
import { Shell } from './components/layout/Shell';
import { useWorkspaceStore } from './stores/workspace-store';
import { useGatewayStore } from './stores/gateway-store';
import { useTheme } from './hooks/use-theme';
import './styles/globals.css';

function App() {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const connect = useGatewayStore((s) => s.connect);

  // Initialize theme system — applies CSS vars and dark/light class on <html>
  useTheme();

  useEffect(() => {
    if (activeWorkspace) {
      connect(activeWorkspace.gatewayUrl, activeWorkspace.gatewayToken);
    }
  }, [activeWorkspace?.id, connect]);

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Shell />
    </div>
  );
}

export default App;
