import { GatewayProvider } from './providers/gateway-provider'
import { SessionProvider } from './providers/session-provider'
import { ThemeProvider } from './providers/theme-provider'
import { AppSidebar } from './components/layout/app-sidebar'
import { AgentChat } from './components/chat/agent-chat'
import { CommandPalette } from './components/layout/command-palette'
import { SidebarProvider, SidebarInset } from './components/ui/sidebar'

export function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="openclaw-web-ui-theme">
      <GatewayProvider>
        <SessionProvider>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
              <AgentChat />
            </SidebarInset>
          </SidebarProvider>
          <CommandPalette />
        </SessionProvider>
      </GatewayProvider>
    </ThemeProvider>
  )
}
