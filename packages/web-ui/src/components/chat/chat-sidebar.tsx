import { MessageSquare, Plus, Trash2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSession } from '@/providers/session-provider'
import { Button } from '@/components/ui/button'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar'

export function ChatSidebar() {
  const {
    sessionKey,
    setSessionKey,
    sessions,
    sessionsLoading,
    loadSessions,
    newSession,
    deleteSession,
  } = useSession()

  return (
    <>
      <SidebarGroup>
        <div className="flex items-center justify-between px-2">
          <SidebarGroupLabel>Sessions</SidebarGroupLabel>
          <div className="flex gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => loadSessions()}
              disabled={sessionsLoading}
            >
              <RefreshCw
                className={cn(
                  'h-3.5 w-3.5',
                  sessionsLoading && 'animate-spin',
                )}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={newSession}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <SidebarGroupContent>
          <SidebarMenu>
            {sessions.map((session) => (
              <SidebarMenuItem key={session.key}>
                <SidebarMenuButton
                  isActive={session.key === sessionKey}
                  onClick={() => setSessionKey(session.key)}
                  className="group/item"
                >
                  <MessageSquare className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate text-xs">
                    {session.label || session.displayName || session.key}
                  </span>
                  {session.key !== sessionKey && (
                    <button
                      className="ml-auto hidden h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-destructive/10 group-hover/item:flex"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`Delete session "${session.key}"?`)) {
                          deleteSession(session.key)
                        }
                      }}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </button>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}

            {sessions.length === 0 && !sessionsLoading && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                No sessions yet
              </div>
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  )
}
