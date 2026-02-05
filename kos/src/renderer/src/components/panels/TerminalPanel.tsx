import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { Bot } from "lucide-react";
import { useEffect, useRef, useCallback, useState } from "react";
import "@xterm/xterm/css/xterm.css";

interface TerminalPanelProps {
  terminalId?: string;
  cwd?: string;
  managed?: boolean; // True if controlled by AI agent
  isFocused?: boolean;
}

// Get computed CSS color and convert to hex for xterm
function getCssColor(varName: string, fallback: string): string {
  const style = getComputedStyle(document.documentElement);
  const value = style.getPropertyValue(varName).trim();
  if (!value) return fallback;

  // Create a temporary element to resolve the color
  const temp = document.createElement("div");
  temp.style.color = value;
  document.body.appendChild(temp);
  const computed = getComputedStyle(temp).color;
  document.body.removeChild(temp);

  // Parse rgb/rgba to hex
  const match = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    const r = parseInt(match[1]).toString(16).padStart(2, "0");
    const g = parseInt(match[2]).toString(16).padStart(2, "0");
    const b = parseInt(match[3]).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`;
  }

  return fallback;
}

// Build terminal theme from CSS variables
function buildTheme() {
  const bg = getCssColor("--background", "#ffffff");
  const fg = getCssColor("--foreground", "#1a1a1a");
  const muted = getCssColor("--muted-foreground", "#6b7280");
  const primary = getCssColor("--primary", "#3b82f6");
  const destructive = getCssColor("--destructive", "#ef4444");
  const accent = getCssColor("--accent", "#f3f4f6");

  return {
    background: bg,
    foreground: fg,
    cursor: fg,
    cursorAccent: bg,
    selectionBackground: accent,
    selectionForeground: fg,
    // ANSI colors - use theme-aware colors where sensible
    black: muted,
    red: destructive,
    green: "#22c55e",
    yellow: "#eab308",
    blue: primary,
    magenta: "#a855f7",
    cyan: "#06b6d4",
    white: fg,
    brightBlack: muted,
    brightRed: "#f87171",
    brightGreen: "#4ade80",
    brightYellow: "#fde047",
    brightBlue: "#60a5fa",
    brightMagenta: "#c084fc",
    brightCyan: "#22d3ee",
    brightWhite: fg,
  };
}

export function TerminalPanel({
  terminalId: stableId,
  cwd,
  managed,
  isFocused,
}: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const terminalIdRef = useRef<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Initialize terminal
  const initTerminal = useCallback(async () => {
    const container = containerRef.current;
    if (!container || terminalRef.current) return;

    // Create xterm instance with theme from CSS variables
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      fontSize: 13,
      lineHeight: 1.2,
      theme: buildTheme(),
    });

    // Create and load fit addon
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    // Open terminal in container
    terminal.open(container);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Capture references at schedule time to avoid race conditions with React StrictMode
    // (RAF may run after component remounts, seeing the wrong terminal instance)
    const capturedTerminal = terminal;
    const capturedFitAddon = fitAddon;

    // Defer fit() and PTY creation to next frame to ensure terminal viewport is initialized
    // This fixes "Cannot read properties of undefined (reading 'dimensions')" error
    requestAnimationFrame(async () => {
      // Check if this terminal is still the current one (not replaced by remount)
      if (terminalRef.current !== capturedTerminal) return;

      capturedFitAddon.fit();

      // Get dimensions after fit
      const cols = capturedTerminal.cols;
      const rows = capturedTerminal.rows;

      // Create PTY process (or reattach to existing if stableId provided and PTY still exists)
      try {
        console.log(`[TerminalPanel] 📡 Requesting terminal: stableId=${stableId}`);
        const result = await window.api.terminal.create(cwd, cols, rows, stableId);
        terminalIdRef.current = result.id;
        setIsConnected(true);
        console.log(`[TerminalPanel] ✅ Connected: id=${result.id}, pid=${result.pid}`);

        // Intercept Cmd+K to clear terminal (like iTerm2/VS Code)
        capturedTerminal.attachCustomKeyEventHandler((e) => {
          if (e.key === "k" && e.metaKey && !e.shiftKey && e.type === "keydown") {
            e.preventDefault();
            e.stopPropagation();
            // Clear screen + scrollback + cursor home via PTY escape sequences
            if (terminalIdRef.current) {
              window.api.terminal.write(terminalIdRef.current, "\x1b[2J\x1b[3J\x1b[H");
              window.api.terminal.clearScrollback(terminalIdRef.current);
            }
            capturedTerminal.clear();
            return false;
          }
          return true;
        });

        // Auto-focus the terminal (e.g., when split creates a new terminal pane)
        capturedTerminal.focus();

        // Forward input to PTY
        capturedTerminal.onData((data) => {
          if (terminalIdRef.current) {
            window.api.terminal.write(terminalIdRef.current, data);
          }
        });
      } catch (err) {
        console.error(`[TerminalPanel] ❌ Failed to create terminal:`, err);
        capturedTerminal.writeln(`\x1b[31mFailed to create terminal: ${err}\x1b[0m`);
      }
    });
  }, [cwd, stableId]);

  // Handle data from PTY
  useEffect(() => {
    const removeDataListener = window.api.terminal.onData((id, data) => {
      if (id === terminalIdRef.current && terminalRef.current) {
        terminalRef.current.write(data);
      }
    });

    const removeExitListener = window.api.terminal.onExit((id, code) => {
      if (id === terminalIdRef.current && terminalRef.current) {
        terminalRef.current.writeln(`\r\n\x1b[33mProcess exited with code ${code}\x1b[0m`);
        setIsConnected(false);
      }
    });

    return () => {
      removeDataListener();
      removeExitListener();
    };
  }, []);

  // Initialize on mount
  useEffect(() => {
    initTerminal();

    return () => {
      // Detach from PTY without killing it (keeps PTY alive for HMR reconnection)
      // The PTY survives in the main process and we can reattach on remount
      if (terminalIdRef.current) {
        console.log(`[TerminalPanel] 🔌 Detaching from terminal: ${terminalIdRef.current}`);
        window.api.terminal.detach(terminalIdRef.current);
        terminalIdRef.current = null;
      }
      // Dispose xterm UI (will be recreated on remount)
      if (terminalRef.current) {
        terminalRef.current.dispose();
        terminalRef.current = null;
      }
      fitAddonRef.current = null;
    };
  }, [initTerminal]);

  // Focus xterm when panel receives focus via keyboard shortcut
  useEffect(() => {
    if (isFocused && terminalRef.current) {
      console.log(`[TerminalPanel] 🎯 Focusing terminal: ${stableId}`);
      terminalRef.current.focus();
    }
  }, [isFocused, stableId]);

  // Handle resize with debouncing to prevent rapid PTY resize calls during drag
  useEffect(() => {
    if (!isConnected) return;

    const container = containerRef.current;
    if (!container) return;

    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    let lastCols = terminalRef.current?.cols ?? 0;
    let lastRows = terminalRef.current?.rows ?? 0;

    const handleResize = () => {
      // Debounce: wait for resize to settle before updating PTY
      if (resizeTimeout) clearTimeout(resizeTimeout);

      resizeTimeout = setTimeout(() => {
        if (!fitAddonRef.current || !terminalRef.current || !terminalIdRef.current) return;

        // Fit xterm to container
        fitAddonRef.current.fit();

        const cols = terminalRef.current.cols;
        const rows = terminalRef.current.rows;

        // Only send resize to PTY if dimensions actually changed
        if (cols !== lastCols || rows !== lastRows) {
          lastCols = cols;
          lastRows = rows;
          window.api.terminal.resize(terminalIdRef.current, cols, rows);
        }
      }, 100); // 100ms debounce
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(container);

    // Also handle when terminal first becomes visible (e.g., tab switch)
    handleResize();

    return () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      observer.disconnect();
    };
  }, [isConnected]);

  // Update theme when dark mode changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (terminalRef.current) {
        terminalRef.current.options.theme = buildTheme();
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  // Focus terminal when clicking container
  const handleContainerClick = useCallback(() => {
    terminalRef.current?.focus();
  }, []);

  return (
    <div className="h-full w-full relative">
      {managed && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 border border-primary/20 text-primary text-xs font-medium">
          <Bot className="h-3 w-3" />
          AI-controlled
        </div>
      )}
      <div
        ref={containerRef}
        className="h-full w-full bg-background overflow-hidden"
        onClick={handleContainerClick}
      />
    </div>
  );
}
