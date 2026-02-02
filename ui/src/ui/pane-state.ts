/**
 * Transient UI state for each visible pane.
 *
 * This is separate from ThreadState (which holds chat data and tool stream).
 * PaneState tracks per-pane UI concerns like scroll position and sidebar visibility.
 */

export interface ArtifactTab {
  id: string
  filePath: string
  fileName: string
  content: string | null
  mtime: number | null
  loading: boolean
  error: string | null
  /** True when the tab shows raw tool output instead of a file. */
  isLegacy?: boolean
  /** For markdown files: whether to show raw source or rendered. */
  showRaw?: boolean
  /** Brief visual indicator that content was updated. */
  updated?: boolean
  /** Currently in edit mode. */
  editing?: boolean
  /** Draft content while editing. */
  editDraft?: string
  /** Currently saving to disk. */
  saving?: boolean
}

export interface PaneState {
  paneId: string
  threadId: string
  scrollUserNearBottom: boolean
  // Legacy sidebar fields
  sidebarOpen: boolean
  sidebarContent: string | null
  sidebarError: string | null
  sidebarSplitRatio: number
}

export function createPaneState(paneId: string, threadId: string): PaneState {
  return {
    paneId,
    threadId,
    scrollUserNearBottom: true,
    sidebarOpen: false,
    sidebarContent: null,
    sidebarError: null,
    sidebarSplitRatio: 0.6,
  }
}

/**
 * Sync pane states map with the current layout.
 * Creates new PaneState entries for new panes, removes stale ones.
 */
export function syncPaneStates(
  current: Map<string, PaneState>,
  leafEntries: Array<{ paneId: string; threadId: string }>,
): Map<string, PaneState> {
  const next = new Map<string, PaneState>()
  for (const entry of leafEntries) {
    const existing = current.get(entry.paneId)
    if (existing) {
      // Update threadId if changed (e.g. drag-and-drop replaced thread)
      if (existing.threadId !== entry.threadId) {
        next.set(entry.paneId, {
          ...createPaneState(entry.paneId, entry.threadId),
          sidebarSplitRatio: existing.sidebarSplitRatio,
        })
      } else {
        next.set(entry.paneId, existing)
      }
    } else {
      next.set(entry.paneId, createPaneState(entry.paneId, entry.threadId))
    }
  }
  return next
}
