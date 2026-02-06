import { useEffect } from "react";

export interface KeyboardShortcut {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  handler: (e: KeyboardEvent) => void;
  description?: string;
  /** If true, this shortcut won't fire when focus is inside a terminal panel */
  skipInTerminal?: boolean;
}

/**
 * Register keyboard shortcuts with proper cleanup
 * Handles both macOS (metaKey) and Windows/Linux (ctrlKey) for modifier shortcuts
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInTerminal = !!(e.target as HTMLElement).closest?.(".xterm");

      for (const shortcut of shortcuts) {
        if (isInTerminal && shortcut.skipInTerminal) continue;
        // For metaKey: if ctrlKey is explicitly set, don't cross-platform match metaKey with ctrlKey
        const metaMatch =
          shortcut.metaKey === undefined ||
          (shortcut.ctrlKey !== undefined
            ? shortcut.metaKey === e.metaKey // explicit ctrl, match meta independently
            : shortcut.metaKey === (e.metaKey || e.ctrlKey)); // cross-platform: meta or ctrl
        const ctrlMatch = shortcut.ctrlKey === undefined || shortcut.ctrlKey === e.ctrlKey;
        const shiftMatch = shortcut.shiftKey === undefined || shortcut.shiftKey === e.shiftKey;
        const altMatch = shortcut.altKey === undefined || shortcut.altKey === e.altKey;
        const keyMatch = shortcut.key.toLowerCase() === e.key.toLowerCase();

        if (keyMatch && metaMatch && ctrlMatch && shiftMatch && altMatch) {
          console.log(
            `[shortcuts] matched: ${shortcut.description} (key=${e.key}, meta=${e.metaKey}, shift=${e.shiftKey}, ctrl=${e.ctrlKey})`,
          );
          e.preventDefault();
          shortcut.handler(e);
          break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shortcuts]);
}
