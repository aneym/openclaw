import { AlertTriangle, Monitor, Play, RefreshCw, Settings, Square } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { useSimulatorStore } from "../../stores/simulator-store";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Slider } from "../ui/slider";

export function SimulatorPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    windows,
    activeWindowId,
    capturing,
    hasScreenPermission,
    hasAccessibilityPermission,
    error,
    lastFrame,
    frameCount,
    fps,
    scaleFactor,
    refreshWindows,
    checkPermissions,
    requestScreenPermission,
    requestAccessibilityPermission,
    startCapture,
    stopCapture,
    injectTap,
    injectSwipe,
    setFps,
    setScaleFactor,
  } = useSimulatorStore();

  // Check permissions and list windows on mount
  useEffect(() => {
    checkPermissions();
    refreshWindows();
  }, [checkPermissions, refreshWindows]);

  // Periodically refresh window list
  useEffect(() => {
    const interval = setInterval(refreshWindows, 5000);
    return () => clearInterval(interval);
  }, [refreshWindows]);

  // Render frame to canvas
  useEffect(() => {
    if (!lastFrame || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Update canvas size if needed
    if (canvas.width !== lastFrame.width || canvas.height !== lastFrame.height) {
      canvas.width = lastFrame.width;
      canvas.height = lastFrame.height;
    }

    // Create ImageData from frame buffer
    // Frame is BGRA, but canvas expects RGBA - need to swap B and R
    const imageData = ctx.createImageData(lastFrame.width, lastFrame.height);
    const src = new Uint8Array(lastFrame.buffer);
    const dst = imageData.data;

    for (let y = 0; y < lastFrame.height; y++) {
      for (let x = 0; x < lastFrame.width; x++) {
        const srcIdx = y * lastFrame.bytesPerRow + x * 4;
        const dstIdx = (y * lastFrame.width + x) * 4;
        // BGRA -> RGBA
        dst[dstIdx] = src[srcIdx + 2]; // R <- B
        dst[dstIdx + 1] = src[srcIdx + 1]; // G
        dst[dstIdx + 2] = src[srcIdx]; // B <- R
        dst[dstIdx + 3] = src[srcIdx + 3]; // A
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }, [lastFrame]);

  // Handle canvas click -> inject tap
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current || !activeWindowId || !lastFrame) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const scaleX = lastFrame.width / rect.width;
      const scaleY = lastFrame.height / rect.height;

      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      injectTap(x, y);
    },
    [activeWindowId, lastFrame, injectTap],
  );

  // Handle swipe gestures
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current || !lastFrame) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const scaleX = lastFrame.width / rect.width;
      const scaleY = lastFrame.height / rect.height;

      swipeStartRef.current = {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    },
    [lastFrame],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current || !activeWindowId || !lastFrame || !swipeStartRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const scaleX = lastFrame.width / rect.width;
      const scaleY = lastFrame.height / rect.height;

      const endX = (e.clientX - rect.left) * scaleX;
      const endY = (e.clientY - rect.top) * scaleY;

      const dx = endX - swipeStartRef.current.x;
      const dy = endY - swipeStartRef.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // If moved more than 20px, treat as swipe
      if (distance > 20) {
        injectSwipe(swipeStartRef.current.x, swipeStartRef.current.y, endX, endY, 300);
      } else {
        // Otherwise treat as tap
        injectTap(swipeStartRef.current.x, swipeStartRef.current.y);
      }

      swipeStartRef.current = null;
    },
    [activeWindowId, lastFrame, injectTap, injectSwipe],
  );

  // Permission missing UI
  if (!hasScreenPermission) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
        <AlertTriangle className="h-12 w-12 text-yellow-500" />
        <div>
          <h3 className="font-semibold text-lg">Screen Recording Permission Required</h3>
          <p className="text-sm text-muted-foreground mt-2">
            kOS needs Screen Recording permission to capture the iOS Simulator window.
          </p>
        </div>
        <Button onClick={requestScreenPermission}>Open System Settings</Button>
        <Button variant="ghost" size="sm" onClick={checkPermissions}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Check Again
        </Button>
      </div>
    );
  }

  // No windows available
  if (windows.length === 0 && !capturing) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
        <Monitor className="h-12 w-12 text-muted-foreground" />
        <div>
          <h3 className="font-semibold text-lg">No iOS Simulator Running</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Start an iOS Simulator to capture its window.
          </p>
        </div>
        <Button variant="outline" onClick={refreshWindows}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>
    );
  }

  const selectedWindow = windows.find((w) => w.windowId === activeWindowId);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 border-b border-border">
        {/* Window selector */}
        <Select
          value={activeWindowId?.toString() ?? ""}
          onValueChange={(v) => startCapture(parseInt(v, 10))}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select Simulator" />
          </SelectTrigger>
          <SelectContent>
            {windows.map((w) => (
              <SelectItem key={w.windowId} value={w.windowId.toString()}>
                {w.title || `Simulator ${w.windowId}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Play/Stop button */}
        {capturing ? (
          <Button variant="outline" size="icon" onClick={stopCapture}>
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            variant="outline"
            size="icon"
            disabled={!activeWindowId && windows.length === 0}
            onClick={() => {
              const windowId = activeWindowId ?? windows[0]?.windowId;
              if (windowId) startCapture(windowId);
            }}
          >
            <Play className="h-4 w-4" />
          </Button>
        )}

        {/* Refresh */}
        <Button variant="ghost" size="icon" onClick={refreshWindows}>
          <RefreshCw className="h-4 w-4" />
        </Button>

        {/* Settings */}
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon">
              <Settings className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Capture Settings</DialogTitle>
              <DialogDescription>
                Configure simulator capture quality and performance.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Frame Rate: {fps} fps</Label>
                <Slider
                  value={[fps]}
                  min={15}
                  max={60}
                  step={5}
                  onValueChange={([v]) => setFps(v)}
                />
              </div>
              <div className="space-y-2">
                <Label>Scale Factor: {scaleFactor.toFixed(1)}x</Label>
                <Slider
                  value={[scaleFactor * 10]}
                  min={5}
                  max={20}
                  step={1}
                  onValueChange={([v]) => setScaleFactor(v / 10)}
                />
              </div>
              {!hasAccessibilityPermission && (
                <div className="rounded-lg bg-yellow-500/10 p-3">
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">
                    Accessibility permission required for input injection.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={requestAccessibilityPermission}
                  >
                    Grant Permission
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Frame counter */}
        {capturing && (
          <span className="ml-auto text-xs text-muted-foreground">{frameCount} frames</span>
        )}
      </div>

      {/* Canvas container */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center bg-black/5 dark:bg-white/5 overflow-hidden"
      >
        {capturing && lastFrame ? (
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-full object-contain cursor-crosshair"
            style={{
              imageRendering: "auto",
            }}
            onClick={handleCanvasClick}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
          />
        ) : (
          <div className="text-center text-muted-foreground">
            {selectedWindow ? <p>Click play to start capture</p> : <p>Select a simulator window</p>}
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="p-2 bg-destructive/10 border-t border-destructive/20">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}
    </div>
  );
}
