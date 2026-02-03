import { useGatewayStore } from "../../stores/gateway-store";

export function ConnectionSettings() {
  const connected = useGatewayStore((s) => s.connected);
  const error = useGatewayStore((s) => s.error);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Connection</h2>
        <p className="text-sm text-muted-foreground">
          Gateway connection status and configuration.
        </p>
      </div>

      <div className="space-y-4">
        <div className="p-4 rounded-lg border border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <div
              className={`w-3 h-3 rounded-full ${connected ? "bg-green-500" : error ? "bg-red-500" : "bg-yellow-500"}`}
            />
            <div>
              <div className="font-medium">
                {connected ? "Connected" : error ? "Disconnected" : "Connecting..."}
              </div>
              {error && <div className="text-sm text-destructive">{error}</div>}
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Gateway URL is auto-detected from your OpenClaw configuration. To change the gateway URL
          or token, update your OpenClaw config file.
        </p>
      </div>
    </div>
  );
}
