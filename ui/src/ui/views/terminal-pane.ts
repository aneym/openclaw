/**
 * Terminal pane — renders an xterm.js terminal connected to a PTY on the gateway
 * via WebSocket.
 */
import { html, type TemplateResult } from "lit";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import type { AppViewState } from "../app-view-state";

export interface TerminalPaneProps {
  paneId: string;
  terminalId: string;
  state: AppViewState;
  isFocused: boolean;
}

const DARK_THEME = {
  background: "#1a1a2e",
  foreground: "#e0e0e0",
  cursor: "#f0f0f0",
  cursorAccent: "#1a1a2e",
  selectionBackground: "#3a3a5e",
  selectionForeground: "#ffffff",
  black: "#1a1a2e",
  red: "#ff6b6b",
  green: "#51cf66",
  yellow: "#fcc419",
  blue: "#339af0",
  magenta: "#cc5de8",
  cyan: "#22b8cf",
  white: "#e0e0e0",
  brightBlack: "#495057",
  brightRed: "#ff8787",
  brightGreen: "#69db7c",
  brightYellow: "#ffd43b",
  brightBlue: "#5c7cfa",
  brightMagenta: "#da77f2",
  brightCyan: "#3bc9db",
  brightWhite: "#f8f9fa",
};

const LIGHT_THEME = {
  background: "#ffffff",
  foreground: "#212529",
  cursor: "#212529",
  cursorAccent: "#ffffff",
  selectionBackground: "#d0ebff",
  selectionForeground: "#000000",
  black: "#212529",
  red: "#c92a2a",
  green: "#2b8a3e",
  yellow: "#e67700",
  blue: "#1864ab",
  magenta: "#862e9c",
  cyan: "#0b7285",
  white: "#f8f9fa",
  brightBlack: "#868e96",
  brightRed: "#e03131",
  brightGreen: "#37b24d",
  brightYellow: "#f08c00",
  brightBlue: "#1c7ed6",
  brightMagenta: "#9c36b5",
  brightCyan: "#1098ad",
  brightWhite: "#ffffff",
};

/** Active terminal instances keyed by paneId. */
const activeTerminals = new Map<
  string,
  {
    terminal: Terminal;
    fitAddon: FitAddon;
    ws: WebSocket | null;
    resizeObserver: ResizeObserver | null;
    disposed: boolean;
    exitCode: number | null;
  }
>();

/** Debounce timer for resize events. */
const resizeTimers = new Map<string, ReturnType<typeof setTimeout>>();

function getWsUrl(state: AppViewState, terminalId: string): string {
  // Derive WS URL from basePath
  const base = state.basePath || window.location.origin;
  const wsProto = base.startsWith("https") ? "wss" : "ws";
  const host = base.replace(/^https?:\/\//, "");
  let url = `${wsProto}://${host}/ws/terminal?id=${encodeURIComponent(terminalId)}`;
  if (state.password) {
    url += `&password=${encodeURIComponent(state.password)}`;
  }
  return url;
}

function connectTerminalWs(paneId: string, state: AppViewState, terminalId: string) {
  const entry = activeTerminals.get(paneId);
  if (!entry || entry.disposed) {
    return;
  }

  const wsUrl = getWsUrl(state, terminalId);
  const ws = new WebSocket(wsUrl);
  ws.binaryType = "arraybuffer";
  entry.ws = ws;

  ws.addEventListener("open", () => {
    // Terminal is connected
  });

  ws.addEventListener("message", (evt) => {
    if (entry.disposed) {
      return;
    }
    if (typeof evt.data === "string") {
      // Text frame: control message
      try {
        const msg = JSON.parse(evt.data) as { type: string; id?: string; code?: number };
        if (msg.type === "exit" && typeof msg.code === "number") {
          entry.exitCode = msg.code;
          // Force re-render by triggering a requestUpdate on the app
          requestAnimationFrame(() => {
            const container = document.querySelector(`[data-pane-id="${paneId}"]`);
            if (container) {
              renderExitOverlay(container as HTMLElement, msg.code!, paneId, state, terminalId);
            }
          });
        }
        // "connected" message — no action needed
      } catch {
        // ignore
      }
    } else {
      // Binary frame: PTY output
      const data = new Uint8Array(evt.data as ArrayBuffer);
      entry.terminal.write(data);
    }
  });

  ws.addEventListener("close", () => {
    if (entry.disposed) {
      return;
    }
    entry.ws = null;
    // If no exit code, show disconnected state
    if (entry.exitCode === null) {
      requestAnimationFrame(() => {
        const container = document.querySelector(`[data-pane-id="${paneId}"]`);
        if (container) {
          renderDisconnectedOverlay(container as HTMLElement, paneId, state, terminalId);
        }
      });
    }
  });

  ws.addEventListener("error", () => {
    // WebSocket errors lead to close events
  });

  // Pipe terminal input → WS
  entry.terminal.onData((data) => {
    if (entry.ws && entry.ws.readyState === WebSocket.OPEN) {
      entry.ws.send(new TextEncoder().encode(data));
    }
  });
}

function renderExitOverlay(
  container: HTMLElement,
  exitCode: number,
  paneId: string,
  state: AppViewState,
  terminalId: string,
) {
  removeOverlay(container);
  const overlay = document.createElement("div");
  overlay.className = "terminal-overlay";
  overlay.innerHTML = `
    <div class="terminal-overlay__content">
      <div class="terminal-overlay__text">Process exited with code ${exitCode}</div>
      <div class="terminal-overlay__actions">
        <button class="terminal-overlay__btn terminal-overlay__btn--restart">Restart</button>
        <button class="terminal-overlay__btn terminal-overlay__btn--close">Close</button>
      </div>
    </div>
  `;
  overlay.querySelector(".terminal-overlay__btn--restart")?.addEventListener("click", () => {
    removeOverlay(container);
    void restartTerminal(paneId, state);
  });
  overlay.querySelector(".terminal-overlay__btn--close")?.addEventListener("click", () => {
    state.closeTerminalPane(paneId);
  });
  container.appendChild(overlay);
}

function renderDisconnectedOverlay(
  container: HTMLElement,
  paneId: string,
  state: AppViewState,
  terminalId: string,
) {
  removeOverlay(container);
  const overlay = document.createElement("div");
  overlay.className = "terminal-overlay";
  overlay.innerHTML = `
    <div class="terminal-overlay__content">
      <div class="terminal-overlay__text">Disconnected</div>
      <div class="terminal-overlay__actions">
        <button class="terminal-overlay__btn terminal-overlay__btn--reconnect">Reconnect</button>
        <button class="terminal-overlay__btn terminal-overlay__btn--close">Close</button>
      </div>
    </div>
  `;
  overlay.querySelector(".terminal-overlay__btn--reconnect")?.addEventListener("click", () => {
    removeOverlay(container);
    connectTerminalWs(paneId, state, terminalId);
  });
  overlay.querySelector(".terminal-overlay__btn--close")?.addEventListener("click", () => {
    state.closeTerminalPane(paneId);
  });
  container.appendChild(overlay);
}

function removeOverlay(container: HTMLElement) {
  const existing = container.querySelector(".terminal-overlay");
  if (existing) {
    existing.remove();
  }
}

async function restartTerminal(paneId: string, state: AppViewState) {
  // Kill old, create new
  const entry = activeTerminals.get(paneId);
  if (entry) {
    entry.disposed = true;
    entry.terminal.dispose();
    entry.ws?.close();
    entry.resizeObserver?.disconnect();
    activeTerminals.delete(paneId);
  }

  // Create a new terminal session via HTTP
  const base = state.basePath || window.location.origin;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (state.password) {
    headers["Authorization"] = `Bearer ${state.password}`;
  }
  const resp = await fetch(`${base}/api/terminals`, { method: "POST", headers });
  if (!resp.ok) {
    return;
  }
  const { id: newTerminalId } = (await resp.json()) as { id: string };
  state.replaceTerminalInPane(paneId, newTerminalId);
}

function setupTerminal(paneId: string, terminalId: string, state: AppViewState) {
  const isDark = state.themeResolved === "dark";
  const theme = isDark ? DARK_THEME : LIGHT_THEME;

  const terminal = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
    lineHeight: 1.2,
    theme,
    scrollback: 1000,
    allowProposedApi: true,
  });

  const fitAddon = new FitAddon();
  const webLinksAddon = new WebLinksAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(webLinksAddon);

  const entry = {
    terminal,
    fitAddon,
    ws: null as WebSocket | null,
    resizeObserver: null as ResizeObserver | null,
    disposed: false,
    exitCode: null as number | null,
  };
  activeTerminals.set(paneId, entry);

  // The actual DOM mount happens after Lit renders (in the updated callback)
  requestAnimationFrame(() => {
    const container = document.querySelector(`[data-pane-id="${paneId}"] .terminal-container`);
    if (!container || entry.disposed) {
      return;
    }
    terminal.open(container as HTMLElement);
    fitAddon.fit();

    // ResizeObserver for auto-fit
    const ro = new ResizeObserver(() => {
      // Debounce resize to avoid flooding
      const existing = resizeTimers.get(paneId);
      if (existing) {
        clearTimeout(existing);
      }
      resizeTimers.set(
        paneId,
        setTimeout(() => {
          resizeTimers.delete(paneId);
          if (!entry.disposed) {
            fitAddon.fit();
            // Send resize to server
            if (entry.ws && entry.ws.readyState === WebSocket.OPEN) {
              entry.ws.send(
                JSON.stringify({
                  type: "resize",
                  cols: terminal.cols,
                  rows: terminal.rows,
                }),
              );
            }
          }
        }, 100),
      );
    });
    ro.observe(container as HTMLElement);
    entry.resizeObserver = ro;

    // Connect WS
    connectTerminalWs(paneId, state, terminalId);
  });
}

/** Clean up a terminal pane. */
export function disposeTerminalPane(paneId: string) {
  const entry = activeTerminals.get(paneId);
  if (!entry) {
    return;
  }
  entry.disposed = true;
  entry.terminal.dispose();
  entry.ws?.close();
  entry.resizeObserver?.disconnect();
  activeTerminals.delete(paneId);
  const timer = resizeTimers.get(paneId);
  if (timer) {
    clearTimeout(timer);
    resizeTimers.delete(paneId);
  }
}

/** Check if a terminal pane already has an active terminal. */
function hasActiveTerminal(paneId: string): boolean {
  const entry = activeTerminals.get(paneId);
  return !!entry && !entry.disposed;
}

export function renderTerminalPane(props: TerminalPaneProps): TemplateResult {
  const { paneId, terminalId, state, isFocused } = props;

  // Initialize terminal on first render (setup runs in rAF after Lit paints)
  if (!hasActiveTerminal(paneId)) {
    setupTerminal(paneId, terminalId, state);
  }

  // Focus terminal when pane gains focus
  if (isFocused) {
    requestAnimationFrame(() => {
      const entry = activeTerminals.get(paneId);
      if (entry && !entry.disposed) {
        entry.terminal.focus();
      }
    });
  }

  return html`
    <div
      class="split-pane split-pane--terminal ${isFocused ? "split-pane--focused" : ""}"
      data-pane-id=${paneId}
      @mousedown=${() => {
        if (!isFocused) {
          state.focusPane(paneId);
        }
      }}
      @contextmenu=${(e: MouseEvent) => {
        e.preventDefault();
        // Could add terminal-specific context menu here
      }}
    >
      <div class="terminal-header">
        <span class="terminal-header__label">Terminal</span>
        <button
          class="terminal-header__close"
          @click=${() => state.closeTerminalPane(paneId)}
          title="Close terminal"
          aria-label="Close terminal"
        >
          ×
        </button>
      </div>
      <div class="terminal-container"></div>
    </div>
  `;
}
