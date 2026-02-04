import { Check, Eye, EyeOff, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSettingsStore } from "../../stores/settings-store";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

// Linear logo SVG
function LinearLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M100 50C100 77.6142 77.6142 100 50 100C22.3858 100 0 77.6142 0 50C0 22.3858 22.3858 0 50 0C77.6142 0 100 22.3858 100 50ZM51.3896 16.4395L84.2894 49.3393C84.7856 47.6162 85.0623 45.8069 85.0869 43.9406L56.8488 15.7025C55.0163 15.724 53.2381 15.9851 51.5397 16.4519L51.3896 16.4395ZM45.9009 18.0174L82.7153 54.8318C81.6685 57.0545 80.3042 59.1062 78.6745 60.9327L39.7999 22.0582C41.6601 20.3948 43.7076 18.9998 45.9009 17.9302L45.9009 18.0174ZM34.9544 26.153L74.5797 65.7783C72.6673 67.4944 70.5224 68.9557 68.1995 70.1116L30.6211 32.5332C31.8068 30.1706 33.2617 27.9899 34.9544 26.0401L34.9544 26.153ZM26.5193 38.8177L61.9149 74.2134C59.5323 75.2972 56.9869 76.0777 54.3329 76.5147L24.2178 46.3996C24.6737 43.6936 25.4291 41.1011 26.456 38.669L26.5193 38.8177ZM23.4751 52.5773L48.1553 77.2575C46.7218 77.4081 45.266 77.4862 43.7927 77.4884L23.2442 56.9399C23.2662 55.4337 23.3523 53.9481 23.5035 52.4852L23.4751 52.5773ZM23.6451 63.0814L37.651 77.0873C32.9696 76.2174 28.6655 74.2865 24.9673 71.5574L23.6451 63.0814L23.6451 63.0814ZM17.3224 58.6881L15.6473 50.2095C15.2197 52.8726 14.9987 55.5966 14.9987 58.3665C14.9987 59.3966 15.0276 60.4194 15.0846 61.4345L17.3224 58.6881Z"
      />
    </svg>
  );
}

export function LinearSettings() {
  const linearConfig = useSettingsStore((s) => s.linearConfig);
  const isLoading = useSettingsStore((s) => s.isLoading);
  const isInitialized = useSettingsStore((s) => s.isInitialized);
  const initialize = useSettingsStore((s) => s.initialize);
  const connectLinear = useSettingsStore((s) => s.connectLinear);
  const disconnectLinear = useSettingsStore((s) => s.disconnectLinear);

  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [isInitialized, initialize]);

  const handleConnect = async () => {
    if (!apiKey.trim()) {
      setError("Please enter an API key");
      return;
    }

    setIsConnecting(true);
    setError(null);

    const result = await connectLinear(apiKey.trim());
    if (!result.success) {
      setError(result.error || "Failed to connect");
    } else {
      setApiKey("");
    }

    setIsConnecting(false);
  };

  const handleDisconnect = async () => {
    await disconnectLinear();
  };

  const isConnected = linearConfig !== null;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <LinearLogo className="h-5 w-5" />
          Linear
        </h3>
        <p className="text-sm text-muted-foreground">
          Connect Linear to view and manage issues in your project boards.
        </p>
      </div>

      {isConnected ? (
        <div className="p-4 rounded-lg border border-border bg-muted/30 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <LinearLogo className="h-5 w-5" />
              </div>
              <div>
                <div className="font-medium flex items-center gap-2">
                  {linearConfig.userName}
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
            <Label htmlFor="linear-key">API Key</Label>
            <div className="relative">
              <Input
                id="linear-key"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="lin_api_xxxxxxxxxxxx"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Generate an API key at{" "}
              <a
                href="https://linear.app/kineticapps/settings/account/security"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Linear Settings → Account → Security
              </a>
              .
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <X className="h-4 w-4" />
              {error}
            </div>
          )}

          <Button onClick={handleConnect} disabled={isConnecting || !apiKey.trim()}>
            {isConnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Connect
          </Button>
        </div>
      )}
    </div>
  );
}
