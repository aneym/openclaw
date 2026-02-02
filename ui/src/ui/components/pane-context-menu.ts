/**
 * Context menu for split-pane management.
 *
 * Shows options: Split Right, Split Down, Close Pane, New Thread, Focus Next.
 * Positioned at cursor coordinates, dismissed on outside click / Escape / selection.
 */
import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";

export interface PaneContextMenuCallbacks {
  onSplitHorizontal: () => void;
  onSplitVertical: () => void;
  onClosePane: () => void;
  onNewThread: () => void;
  onFocusNext: () => void;
}

@customElement("pane-context-menu")
export class PaneContextMenu extends LitElement {
  @property({ type: Number }) x = 0;
  @property({ type: Number }) y = 0;
  @property({ type: Boolean, reflect: true }) open = false;
  @property({ type: Boolean }) showClosePane = true;
  @property({ type: Boolean }) showFocusNext = true;
  @property({ attribute: false }) callbacks: PaneContextMenuCallbacks | null = null;

  /** Open the menu at the given coordinates. */
  show(
    clientX: number,
    clientY: number,
    opts?: { showClosePane?: boolean; showFocusNext?: boolean },
  ) {
    this.x = clientX;
    this.y = clientY;
    if (opts) {
      this.showClosePane = opts.showClosePane ?? true;
      this.showFocusNext = opts.showFocusNext ?? true;
    }
    this.open = true;
  }

  static styles = css`
    :host {
      position: fixed;
      z-index: 1100;
      pointer-events: none;
    }
    
    :host([open]) {
      pointer-events: auto;
    }
    
    .menu {
      position: fixed;
      min-width: 180px;
      padding: 4px 0;
      background: var(--popover, #1e1e1e);
      color: var(--popover-foreground, #e0e0e0);
      border: 1px solid var(--border, #333);
      border-radius: var(--radius-md, 8px);
      box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.4));
      animation: ctx-menu-in 120ms ease-out;
    }
    
    @keyframes ctx-menu-in {
      from {
        opacity: 0;
        transform: scale(0.95);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }
    
    .menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      font-size: 13px;
      cursor: pointer;
      border: none;
      background: none;
      color: inherit;
      width: 100%;
      text-align: left;
      border-radius: 0;
    }
    
    .menu-item:hover {
      background: var(--accent, #007bff);
      color: var(--accent-foreground, #fff);
    }
    
    .menu-item kbd {
      margin-left: auto;
      font-size: 11px;
      opacity: 0.5;
      font-family: inherit;
    }
    
    .separator {
      height: 1px;
      margin: 4px 0;
      background: var(--border, #333);
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("mousedown", this._onDocClick);
    document.addEventListener("keydown", this._onKeyDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("mousedown", this._onDocClick);
    document.removeEventListener("keydown", this._onKeyDown);
  }

  private _onDocClick = (e: MouseEvent) => {
    if (!this.open) {
      return;
    }
    // Close if mousedown is outside the menu
    const path = e.composedPath();
    if (!path.includes(this)) {
      this.dismiss();
    }
  };

  private _onKeyDown = (e: KeyboardEvent) => {
    if (!this.open) {
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      this.dismiss();
    }
  };

  private dismiss() {
    this.open = false;
    this.dispatchEvent(new CustomEvent("dismiss"));
  }

  private select(action: () => void) {
    action();
    this.dismiss();
  }

  render() {
    if (!this.open || !this.callbacks) {
      return nothing;
    }

    // Clamp position to keep menu on-screen
    const menuW = 200;
    const menuH = 200;
    const x = Math.min(this.x, window.innerWidth - menuW);
    const y = Math.min(this.y, window.innerHeight - menuH);

    return html`
      <div class="menu" style="left:${x}px;top:${y}px;">
        <button class="menu-item" @click=${() => this.select(this.callbacks!.onSplitHorizontal)}>
          Split Right
          <kbd>\u2318D</kbd>
        </button>
        <button class="menu-item" @click=${() => this.select(this.callbacks!.onSplitVertical)}>
          Split Down
          <kbd>\u21E7\u2318D</kbd>
        </button>
        ${
          this.showClosePane
            ? html`<button class="menu-item" @click=${() => this.select(this.callbacks!.onClosePane)}>
              Close Pane
              <kbd>\u2303W</kbd>
            </button>`
            : nothing
        }
        <button class="menu-item" @click=${() => this.select(this.callbacks!.onNewThread)}>
          New Thread
        </button>
        ${
          this.showFocusNext
            ? html`
              <div class="separator"></div>
              <button class="menu-item" @click=${() => this.select(this.callbacks!.onFocusNext)}>
                Focus Next Pane
                <kbd>\u2318]</kbd>
              </button>
            `
            : nothing
        }
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pane-context-menu": PaneContextMenu;
  }
}
