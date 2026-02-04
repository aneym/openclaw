import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef, useCallback, useState } from "react";
import "@xterm/xterm/css/xterm.css";

interface TerminalPanelProps {
  terminalId?: string;
  cwd?: string;
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

export function TerminalPanel({ cwd }: TerminalPanelProps) {
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

    // Defer fit() and PTY creation to next frame to ensure terminal viewport is initialized
    // This fixes "Cannot read properties of undefined (reading 'dimensions')" error
    requestAnimationFrame(async () => {
      if (!fitAddonRef.current || !terminalRef.current) return;

      fitAddonRef.current.fit();

      // Get dimensions after fit
      const cols = terminalRef.current.cols;
      const rows = terminalRef.current.rows;

      // Create PTY process
      try {
        const result = await window.api.terminal.create(cwd, cols, rows);
        terminalIdRef.current = result.id;
        setIsConnected(true);

        // Forward input to PTY
        terminalRef.current.onData((data) => {
          if (terminalIdRef.current) {
            window.api.terminal.write(terminalIdRef.current, data);
          }
        });
      } catch (err) {
        terminalRef.current?.writeln(`\x1b[31mFailed to create terminal: ${err}\x1b[0m`);
      }
    });
  }, [cwd]);

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
      // Cleanup terminal and PTY process
      if (terminalIdRef.current) {
        window.api.terminal.kill(terminalIdRef.current);
        terminalIdRef.current = null;
      }
      if (terminalRef.current) {
        terminalRef.current.dispose();
        terminalRef.current = null;
      }
      fitAddonRef.current = null;
    };
  }, [initTerminal]);

  // Handle resize
  useEffect(() => {
    if (!isConnected) return;

    const container = containerRef.current;
    if (!container) return;

    const handleResize = () => {
      if (fitAddonRef.current && terminalRef.current && terminalIdRef.current) {
        fitAddonRef.current.fit();
        const cols = terminalRef.current.cols;
        const rows = terminalRef.current.rows;
        window.api.terminal.resize(terminalIdRef.current, cols, rows);
      }
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(container);

    return () => {
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
    <div
      ref={containerRef}
      className="h-full w-full bg-background overflow-hidden"
      onClick={handleContainerClick}
    />
  );
}
