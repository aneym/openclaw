import { useGatewayStore } from "../../stores/gateway-store";

export function ConnectionSettings() {
  const connected = useGatewayStore((s) => s.connected);
  const error = useGatewayStore((s) => s.error);
  const hello = useGatewayStore((s) => s.hello);
  const currentUrl = useGatewayStore((s) => s.currentUrl);
  const hasToken = useGatewayStore((s) => s.hasToken);
  const configSource = useGatewayStore((s) => s.configSource);

  // Determine environment from config source and URL
  const getEnvironment = () => {
    if (!configSource && !currentUrl) return "Unknown";
    if (configSource?.includes(".openclaw-dev")) return "Dev";
    if (configSource?.includes(".openclaw/")) return "Production";
    if (currentUrl?.includes(":19001")) return "Dev (port 19001)";
    if (currentUrl?.includes(":18789")) return "Production (port 18789)";
    return "Custom";
  };

  const getEnvironmentBadgeColor = () => {
    const env = getEnvironment();
    if (env.startsWith("Dev")) return "bg-yellow-500/20 text-yellow-500 border-yellow-500/30";
    if (env.startsWith("Production")) return "bg-green-500/20 text-green-500 border-green-500/30";
    return "bg-muted text-muted-foreground";
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Connection</h2>
        <p className="text-sm text-muted-foreground">
          Gateway connection status and configuration.
        </p>
      </div>

      <div className="space-y-4">
        {/* Status indicator */}
        <div className="p-4 rounded-lg border border-border bg-muted/30">
          <div className="flex items-center justify-between">
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
            <span
              className={`px-2 py-0.5 text-xs font-medium rounded border ${getEnvironmentBadgeColor()}`}
            >
              {getEnvironment()}
            </span>
          </div>
        </div>

        {/* Debug info */}
        <div className="p-4 rounded-lg border border-border bg-muted/10 font-mono text-xs space-y-2">
          <div className="text-muted-foreground font-sans text-sm font-medium mb-3">Debug Info</div>
          <div className="grid grid-cols-[120px_1fr] gap-y-1.5">
            <span className="text-muted-foreground">Environment:</span>
            <span>{getEnvironment()}</span>

            <span className="text-muted-foreground">Config Source:</span>
            <span className="break-all">{configSource ?? "Not loaded"}</span>

            <span className="text-muted-foreground">Gateway URL:</span>
            <span className="break-all">{currentUrl ?? "Not set"}</span>

            <span className="text-muted-foreground">Auth Token:</span>
            <span>{hasToken ? "✓ Configured" : "✗ None"}</span>

            <span className="text-muted-foreground">Client ID:</span>
            <span>kos</span>

            {connected && hello && (
              <>
                <span className="text-muted-foreground">Protocol:</span>
                <span>v{hello.protocol}</span>

                <span className="text-muted-foreground">Server Version:</span>
                <span>{hello.server?.version ?? "Unknown"}</span>

                <span className="text-muted-foreground">Server Host:</span>
                <span>{hello.server?.host ?? "localhost"}</span>

                <span className="text-muted-foreground">Connection ID:</span>
                <span className="break-all">{hello.server?.connId ?? "Unknown"}</span>
              </>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          kOS auto-detects config from{" "}
          <code className="bg-muted px-1 rounded">~/.openclaw-dev/</code> (dev) or{" "}
          <code className="bg-muted px-1 rounded">~/.openclaw/</code> (prod).
          <br />
          Override with <code className="bg-muted px-1 rounded">OPENCLAW_STATE_DIR</code> env var.
        </p>
      </div>
    </div>
  );
}
