import { Check, Eye, EyeOff, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSettingsStore } from "../../stores/settings-store";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

// GitHub logo SVG (lucide deprecated the Github icon)
function GitHubLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

export function GitHubSettings() {
  const gitHubConfig = useSettingsStore((s) => s.gitHubConfig);
  const isLoading = useSettingsStore((s) => s.isLoading);
  const isInitialized = useSettingsStore((s) => s.isInitialized);
  const initialize = useSettingsStore((s) => s.initialize);
  const connectGitHub = useSettingsStore((s) => s.connectGitHub);
  const disconnectGitHub = useSettingsStore((s) => s.disconnectGitHub);

  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [isInitialized, initialize]);

  const handleConnect = async () => {
    if (!token.trim()) {
      setError("Please enter a token");
      return;
    }

    setIsConnecting(true);
    setError(null);

    const result = await connectGitHub(token.trim());
    if (!result.success) {
      setError(result.error || "Failed to connect");
    } else {
      setToken("");
    }

    setIsConnecting(false);
  };

  const handleDisconnect = async () => {
    await disconnectGitHub();
  };

  const isConnected = gitHubConfig !== null;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <GitHubLogo className="h-5 w-5" />
          GitHub
        </h3>
        <p className="text-sm text-muted-foreground">
          Connect your GitHub account to clone repositories directly into projects.
        </p>
      </div>

      {isConnected ? (
        <div className="p-4 rounded-lg border border-border bg-muted/30 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <GitHubLogo className="h-5 w-5" />
              </div>
              <div>
                <div className="font-medium flex items-center gap-2">
                  {gitHubConfig.username}
                  <Check className="h-4 w-4 text-green-500" />
                </div>
                <div className="text-sm text-muted-foreground">Connected</div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={isLoading}>
              Disconnect
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="github-token">Personal Access Token</Label>
            <div className="relative">
              <Input
                id="github-token"
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxx"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Generate a token at{" "}
              <a
                href="https://github.com/settings/tokens/new?description=kOS&scopes=repo"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                GitHub Settings → Developer Settings → Personal access tokens
              </a>
              . Enable the <code className="bg-muted px-1 rounded">repo</code> scope.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <X className="h-4 w-4" />
              {error}
            </div>
          )}

          <Button onClick={handleConnect} disabled={isConnecting || !token.trim()}>
            {isConnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Connect
          </Button>
        </div>
      )}
    </div>
  );
}
