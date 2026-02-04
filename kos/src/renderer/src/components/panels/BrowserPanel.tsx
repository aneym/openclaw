import { Globe, RefreshCw, ArrowLeft, ArrowRight, Wrench, Copy, Check } from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

interface BrowserPanelProps {
  panelId: string;
  initialUrl?: string;
}

export function BrowserPanel({ initialUrl = "https://example.com" }: BrowserPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState(initialUrl);
  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const [created, setCreated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cdpUrl, setCdpUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Create BrowserView on mount, destroy on unmount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    window.api.browser.create({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    });
    setCreated(true);

    // Navigate to initial URL
    if (initialUrl && initialUrl !== "about:blank") {
      window.api.browser.navigate(initialUrl);
    }

    // Fetch CDP URL after a short delay (browser needs to register)
    setTimeout(async () => {
      const url = await window.api.browser.getCdpUrl();
      setCdpUrl(url);
    }, 500);

    return () => {
      window.api.browser.destroy();
    };
  }, [initialUrl]);

  // Sync bounds on resize
  useEffect(() => {
    if (!created) return;
    const container = containerRef.current;
    if (!container) return;

    const reportBounds = () => {
      const rect = container.getBoundingClientRect();
      window.api.browser.setBounds({
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    };

    const observer = new ResizeObserver(reportBounds);
    observer.observe(container);

    // Also listen for window move/resize
    window.addEventListener("resize", reportBounds);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", reportBounds);
    };
  }, [created]);

  const handleNavigate = useCallback(() => {
    // Add protocol if missing
    let navigateUrl = url;
    if (!/^https?:\/\//i.test(navigateUrl)) {
      navigateUrl = "https://" + navigateUrl;
    }
    setLoading(true);
    setCurrentUrl(navigateUrl);
    setUrl(navigateUrl);
    window.api.browser.navigate(navigateUrl);
    // Clear loading after a brief moment (we don't have load events yet)
    setTimeout(() => setLoading(false), 1000);
  }, [url]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleNavigate();
      }
    },
    [handleNavigate],
  );

  const handleRefresh = useCallback(() => {
    setLoading(true);
    window.api.browser.navigate(currentUrl);
    setTimeout(() => setLoading(false), 1000);
  }, [currentUrl]);

  const handleDevTools = useCallback(() => {
    window.api.browser.openDevTools();
  }, []);

  // Copy CDP URL to clipboard
  const handleCopyCdpUrl = useCallback(async () => {
    if (!cdpUrl) return;
    try {
      await navigator.clipboard.writeText(cdpUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy CDP URL:", err);
    }
  }, [cdpUrl]);

  return (
    <div className="flex flex-col h-full">
      {/* URL bar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b bg-background">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={() => window.api.browser.cdp("Page.goBack")}
          title="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={() => window.api.browser.cdp("Page.goForward")}
          title="Forward"
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={handleRefresh}
          title="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>

        <div className="flex-1 flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter URL..."
            className="h-7 text-xs bg-muted/50"
          />
        </div>

        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={handleNavigate}>
          Go
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={handleDevTools}
          title="DevTools"
        >
          <Wrench className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant={copied ? "default" : "outline"}
          className="h-7 px-2 text-xs"
          onClick={handleCopyCdpUrl}
          disabled={!cdpUrl}
          title={cdpUrl ? `Copy CDP URL: ${cdpUrl}` : "CDP URL not available"}
        >
          {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
          {copied ? "Copied" : "CDP"}
        </Button>
      </div>

      {/* BrowserView renders over this div */}
      <div ref={containerRef} className="flex-1 bg-white" />
    </div>
  );
}
