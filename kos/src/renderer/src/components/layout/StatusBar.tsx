import { useGatewayStore } from '../../stores/gateway-store';
import { useWorkspaceStore } from '../../stores/workspace-store';

export function StatusBar() {
  const connected = useGatewayStore((s) => s.connected);
  const error = useGatewayStore((s) => s.error);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);

  const statusColor = connected ? 'bg-green-500' : error ? 'bg-red-500' : 'bg-yellow-500';
  const statusText = connected ? 'Connected' : error ? 'Disconnected' : 'Connecting...';

  return (
    <div className="h-6 border-t border-border bg-muted/50 px-3 flex items-center justify-between text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${statusColor}`} />
        <span>{statusText}</span>
      </div>
      <div className="flex items-center gap-2">
        {activeWorkspace && (
          <>
            <span>{activeWorkspace.icon || '🏠'}</span>
            <span>{activeWorkspace.name}</span>
          </>
        )}
      </div>
    </div>
  );
}
