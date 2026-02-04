import {
  Globe,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  Wrench,
  Copy,
  Check,
  Plus,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "../../lib/utils";
import { useBrowserStore, type BrowserTab } from "../../stores/browser-store";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

interface BrowserPanelProps {
  panelId: string;
  initialUrl?: string;
}

export function BrowserPanel({ initialUrl = "https://example.com" }: BrowserPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState(initialUrl);
  const [created, setCreated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Shared browser state
  const tabs = useBrowserStore((s) => s.tabs);
  const activeTabId = useBrowserStore((s) => s.activeTabId);
  const cdpUrl = useBrowserStore((s) => s.cdpUrl);
  const setTabs = useBrowserStore((s) => s.setTabs);
  const setActiveTabId = useBrowserStore((s) => s.setActiveTabId);
  const setCdpUrl = useBrowserStore((s) => s.setCdpUrl);
  const setActive = useBrowserStore((s) => s.setActive);

  // Refresh tabs list from main process
  const refreshTabs = useCallback(async () => {
    const tabList = await window.api.browser.listTabs();
    setTabs(tabList);
    const active = tabList.find((t) => t.active);
    if (active) {
      setActiveTabId(active.id);
      setUrl(active.url === "about:blank" ? "" : active.url);
    }
  }, [setTabs, setActiveTabId]);

  // Refresh CDP URL
  const refreshCdpUrl = useCallback(async () => {
    const newCdpUrl = await window.api.browser.getCdpUrl();
    setCdpUrl(newCdpUrl);
  }, [setCdpUrl]);

  // Create BrowserView on mount, destroy on unmount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const init = async () => {
      const rect = container.getBoundingClientRect();
      await window.api.browser.create({
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
      setCreated(true);
      setActive(true);

      // Navigate to initial URL and focus
      if (initialUrl && initialUrl !== "about:blank") {
        await window.api.browser.navigate(initialUrl);
      }
      window.api.browser.focus?.();

      // Refresh state after a short delay
      setTimeout(async () => {
        await refreshTabs();
        await refreshCdpUrl();
      }, 500);
    };

    init();

    return () => {
      window.api.browser.destroy();
      setActive(false);
      setCdpUrl(null);
      setTabs([]);
      setActiveTabId(null);
    };
  }, [initialUrl, setActive, setCdpUrl, setTabs, setActiveTabId, refreshTabs, refreshCdpUrl]);

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
    window.addEventListener("resize", reportBounds);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", reportBounds);
    };
  }, [created]);

  const handleNavigate = useCallback(async () => {
    let navigateUrl = url;
    if (!/^https?:\/\//i.test(navigateUrl)) {
      navigateUrl = "https://" + navigateUrl;
    }
    setLoading(true);
    setUrl(navigateUrl);
    await window.api.browser.navigate(navigateUrl);
    setTimeout(() => setLoading(false), 1000);
    // Refresh state after navigation
    setTimeout(async () => {
      await refreshTabs();
      await refreshCdpUrl();
    }, 1500);
  }, [url, refreshTabs, refreshCdpUrl]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleNavigate();
      }
    },
    [handleNavigate],
  );

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    const activeTab = tabs.find((t) => t.active);
    if (activeTab) {
      await window.api.browser.navigate(activeTab.url);
    }
    setTimeout(() => setLoading(false), 1000);
  }, [tabs]);

  const handleDevTools = useCallback(() => {
    window.api.browser.openDevTools();
  }, []);

  const handleContainerClick = useCallback(() => {
    window.api.browser.focus?.();
  }, []);

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

  // Tab management
  const handleNewTab = useCallback(async () => {
    await window.api.browser.createTab();
    await refreshTabs();
    await refreshCdpUrl();
    setUrl("");
  }, [refreshTabs, refreshCdpUrl]);

  const handleSwitchTab = useCallback(
    async (tabId: string) => {
      await window.api.browser.switchTab(tabId);
      await refreshTabs();
      await refreshCdpUrl();
      const tab = tabs.find((t) => t.id === tabId);
      if (tab) {
        setUrl(tab.url === "about:blank" ? "" : tab.url);
      }
    },
    [refreshTabs, refreshCdpUrl, tabs],
  );

  const handleCloseTab = useCallback(
    async (tabId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      await window.api.browser.closeTab(tabId);
      await refreshTabs();
      await refreshCdpUrl();
    },
    [refreshTabs, refreshCdpUrl],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center gap-0.5 px-1 py-1 border-b bg-muted/30 overflow-x-auto">
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onSwitch={() => handleSwitchTab(tab.id)}
            onClose={(e) => handleCloseTab(tab.id, e)}
          />
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 shrink-0"
          onClick={handleNewTab}
          title="New Tab"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

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

      {/* BrowserView renders over this div - click to focus */}
      <div
        ref={containerRef}
        className="flex-1 bg-white cursor-default"
        onClick={handleContainerClick}
        onMouseDown={handleContainerClick}
      />
    </div>
  );
}

// Tab button component
function TabButton({
  tab,
  isActive,
  onSwitch,
  onClose,
}: {
  tab: BrowserTab;
  isActive: boolean;
  onSwitch: () => void;
  onClose: (e: React.MouseEvent) => void;
}) {
  const displayTitle = tab.title || new URL(tab.url).hostname || "New Tab";
  const truncatedTitle = displayTitle.length > 20 ? displayTitle.slice(0, 20) + "…" : displayTitle;

  return (
    <div
      className={cn(
        "group flex items-center gap-1 px-2 py-1 rounded-md cursor-pointer transition-colors min-w-0 max-w-[160px]",
        isActive ? "bg-background shadow-sm" : "hover:bg-muted/50",
      )}
      onClick={onSwitch}
      title={tab.url}
    >
      <Globe className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="text-xs truncate">{truncatedTitle}</span>
      <button
        className="ml-auto shrink-0 opacity-0 group-hover:opacity-100 hover:bg-muted rounded p-0.5 transition-opacity"
        onClick={onClose}
        title="Close tab"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
