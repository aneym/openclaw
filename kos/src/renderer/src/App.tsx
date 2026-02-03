import { useEffect } from 'react'
import { Shell } from './components/layout/Shell'
import { useWorkspaceStore } from './stores/workspace-store'
import { useGatewayStore } from './stores/gateway-store'
import { useTheme } from './hooks/use-theme'
import './styles/globals.css'

function App() {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace)
  const updateWorkspace = useWorkspaceStore((s) => s.updateWorkspace)
  const connect = useGatewayStore((s) => s.connect)

  // Initialize theme system — applies CSS vars and dark/light class on <html>
  useTheme()

  // Auto-discover gateway config from OpenClaw config on first launch
  useEffect(() => {
    if (!activeWorkspace) return

    // If the workspace already has a token, no need to discover
    if (activeWorkspace.gatewayToken) return

    window.api.getGatewayConfig().then((config) => {
      if (config.token || config.url !== activeWorkspace.gatewayUrl) {
        updateWorkspace(activeWorkspace.id, {
          gatewayUrl: config.url,
          gatewayToken: config.token
        })
      }
    })
  }, [activeWorkspace?.id])

  // Connect to gateway when workspace config is ready
  useEffect(() => {
    if (activeWorkspace?.gatewayToken) {
      connect(activeWorkspace.gatewayUrl, activeWorkspace.gatewayToken)
    }
  }, [activeWorkspace?.gatewayUrl, activeWorkspace?.gatewayToken, connect])

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Shell />
    </div>
  )
}

export default App
