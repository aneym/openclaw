/**
 * Keyboard shortcuts for split-pane management.
 *
 * Cmd+\       -> Toggle sidebar
 * Cmd+E       -> Archive current session
 * Cmd+D       -> Split horizontal (side-by-side)
 * Shift+Cmd+D -> Split vertical (top/bottom)
 * Shift+Cmd+G -> Toggle git source control panel
 * Cmd+]       -> Focus next pane
 * Ctrl+W      -> Close focused pane (Ctrl, not Cmd — Cmd+W closes the browser tab)
 */

type ShortcutHost = {
  tab: string;
  splitLayout: unknown | null;
  splitPane: (direction: "horizontal" | "vertical") => void;
  closePane: (paneId?: string) => void;
  focusNextPane: () => void;
  toggleNav: () => void;
  archiveCurrentSession: () => void;
  toggleGitPanel: () => void;
};

let handler: ((e: KeyboardEvent) => void) | null = null;

export function installKeyboardShortcuts(host: ShortcutHost) {
  removeKeyboardShortcuts();

  handler = (e: KeyboardEvent) => {
    const isMeta = e.metaKey || e.ctrlKey;

    // Cmd+\ -> toggle sidebar (global, works on all tabs)
    if (isMeta && e.key === "\\") {
      e.preventDefault();
      e.stopPropagation();
      host.toggleNav();
      return;
    }

    // Cmd+E -> archive current session (global, works on all tabs)
    if (isMeta && !e.shiftKey && e.key === "e") {
      e.preventDefault();
      e.stopPropagation();
      host.archiveCurrentSession();
      return;
    }

    // Only active on the chat tab
    if (host.tab !== "chat") {
      return;
    }

    // Cmd+D -> split horizontal
    if (isMeta && !e.shiftKey && e.key === "d") {
      e.preventDefault();
      e.stopPropagation();
      host.splitPane("horizontal");
      return;
    }

    // Shift+Cmd+D -> split vertical
    if (isMeta && e.shiftKey && (e.key === "D" || e.key === "d")) {
      e.preventDefault();
      e.stopPropagation();
      host.splitPane("vertical");
      return;
    }

    // Shift+Cmd+G -> toggle git panel
    if (isMeta && e.shiftKey && (e.key === "G" || e.key === "g")) {
      e.preventDefault();
      e.stopPropagation();
      host.toggleGitPanel();
      return;
    }

    // Cmd+] -> focus next pane
    if (isMeta && e.key === "]") {
      if (host.splitLayout) {
        e.preventDefault();
        e.stopPropagation();
        host.focusNextPane();
      }
      return;
    }

    // Ctrl+W -> close focused pane (only Ctrl, not Cmd which closes browser tab)
    if (e.ctrlKey && !e.metaKey && e.key === "w") {
      if (host.splitLayout) {
        e.preventDefault();
        e.stopPropagation();
        host.closePane();
      }
      return;
    }
  };

  document.addEventListener("keydown", handler, true);
}

export function removeKeyboardShortcuts() {
  if (handler) {
    document.removeEventListener("keydown", handler, true);
    handler = null;
  }
}
