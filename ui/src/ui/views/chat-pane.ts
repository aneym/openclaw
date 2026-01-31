/**
 * Thin wrapper around renderChat() that scopes a chat view to a specific pane.
 * Adds a data-pane-id attribute, focus indicator, and pane-specific callbacks.
 */
import { html } from 'lit'
import { renderChat, type ChatProps } from './chat'
import type { AppViewState } from '../app-view-state'
import type { PaneState } from '../pane-state'
import type { SplitLeaf } from '../split-tree'
import { allLeafIds, allLeaves } from '../split-tree'
import { getDragData, getDragPaneData, hasDragData, hasDragPaneData, hasAnyDragData, setDragPaneData, resolveDropZone, dropZoneToDirection } from '../split-dnd'
import { createThreadDescriptor, createThreadState } from '../thread-state'
import { saveThreadDescriptors } from '../thread-storage'
import type { PaneContextMenuCallbacks } from '../components/pane-context-menu'
import '../components/pane-context-menu'
import { humanizeSessionKey } from './thread-list'
import { patchSession } from '../controllers/sessions'

export interface ChatPaneProps {
  leaf: SplitLeaf
  state: AppViewState
  paneState: PaneState | undefined
  isFocused: boolean
}

export function renderChatPane(props: ChatPaneProps) {
  const { leaf, state, paneState, isFocused } = props
  const sessionKey = leaf.threadId
  const showThinking = state.onboarding ? false : state.settings.chatShowThinking
  const chatDisabledReason = state.connected ? null : 'Disconnected from gateway.'
  const chatFocus = state.settings.chatFocusMode || state.onboarding

  // For the focused pane, use the app's live reactive state.
  // For non-focused panes, read from the stored ThreadState.
  const isActiveSession = sessionKey === state.sessionKey
  const threadMapId = state.sessionKeyToThreadId.get(sessionKey)
  const thread = threadMapId ? state.threads.get(threadMapId) : null

  // Collect session keys visible in all panes (for the session picker)
  const openSessionKeys = new Set(
    state.splitLayout
      ? allLeaves(state.splitLayout.root).map((l) => l.threadId)
      : [sessionKey],
  )

  const chatProps: ChatProps = {
    sessionKey,
    onSessionKeyChange: (next) => {
      state.setThreadInPane(leaf.id, next)
    },
    thinkingLevel: isActiveSession ? state.chatThinkingLevel : (thread?.chatThinkingLevel ?? null),
    showThinking,
    loading: isActiveSession ? state.chatLoading : (thread?.chatLoading ?? false),
    sending: isActiveSession ? state.chatSending : (thread?.chatSending ?? false),
    compactionStatus: isActiveSession ? state.compactionStatus : null,
    assistantAvatarUrl: state.chatAvatarUrl,
    messages: isActiveSession ? state.chatMessages : (thread?.chatMessages ?? []),
    toolMessages: isActiveSession ? state.chatToolMessages : (thread?.chatToolMessages ?? []),
    stream: isActiveSession ? state.chatStream : (thread?.chatStream ?? null),
    streamStartedAt: isActiveSession ? state.chatStreamStartedAt : (thread?.chatStreamStartedAt ?? null),
    draft: isActiveSession ? state.chatMessage : (thread?.chatMessage ?? ''),
    queue: isActiveSession ? state.chatQueue : (thread?.chatQueue ?? []),
    connected: state.connected,
    canSend: state.connected,
    disabledReason: chatDisabledReason,
    error: isActiveSession ? state.lastError : null,
    sessions: state.sessionsResult,
    focusMode: chatFocus,
    onRefresh: () => {
      state.resetToolStream()
    },
    onToggleFocusMode: () => {
      if (state.onboarding) return
      state.applySettings({
        ...state.settings,
        chatFocusMode: !state.settings.chatFocusMode,
      })
    },
    onChatScroll: (event) => state.handleChatScroll(event),
    onDraftChange: (next) => {
      if (isActiveSession) {
        state.chatMessage = next
      } else if (thread) {
        thread.chatMessage = next
      }
    },
    attachments: isActiveSession ? state.chatAttachments : (thread?.chatAttachments ?? []),
    onAttachmentsChange: (next) => {
      if (isActiveSession) {
        state.chatAttachments = next
      } else if (thread) {
        thread.chatAttachments = next
      }
    },
    onSend: () => void state.handleSendChat(),
    canAbort: isActiveSession ? Boolean(state.chatRunId) : Boolean(thread?.chatRunId),
    onAbort: () => void state.handleAbortChat(),
    onQueueRemove: (id) => state.removeQueuedMessage(id),
    onNewSession: () => {
      // Create a fresh thread and assign it to this pane
      const parentKey = state.sessionKey.split(':thread:')[0];
      const desc = createThreadDescriptor(parentKey);
      const newThread = createThreadState(desc);
      state.threads.set(desc.id, newThread);
      state.sessionKeyToThreadId.set(desc.sessionKey, desc.id);
      saveThreadDescriptors(state.getThreadDescriptors());
      state.threads = new Map(state.threads);
      state.setThreadInPane(leaf.id, desc.sessionKey);
    },
    sidebarOpen: paneState?.sidebarOpen ?? false,
    sidebarContent: paneState?.sidebarContent ?? null,
    sidebarError: paneState?.sidebarError ?? null,
    splitRatio: paneState?.sidebarSplitRatio ?? 0.6,
    onOpenSidebar: (content: string) => {
      if (paneState) {
        paneState.sidebarContent = content
        paneState.sidebarError = null
        paneState.sidebarOpen = true
        // Trigger reactivity through app state
        state.paneStates = new Map(state.paneStates)
      } else {
        state.handleOpenSidebar(content)
      }
    },
    onCloseSidebar: () => {
      if (paneState) {
        paneState.sidebarOpen = false
        state.paneStates = new Map(state.paneStates)
      } else {
        state.handleCloseSidebar()
      }
    },
    onSplitRatioChange: (ratio: number) => {
      if (paneState) {
        paneState.sidebarSplitRatio = Math.max(0.4, Math.min(0.7, ratio))
        state.paneStates = new Map(state.paneStates)
      } else {
        state.handleSplitRatioChange(ratio)
      }
    },
    assistantName: state.assistantName,
    assistantAvatar: state.assistantAvatar,
    openSessionKeys,
  }

  const handleDragOver = (e: DragEvent) => {
    if (!hasAnyDragData(e)) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'

    // Visual drop indicator for pane drags
    if (hasDragPaneData(e)) {
      const paneEl = e.currentTarget as HTMLElement
      const titlebar = paneEl.querySelector('.split-pane__titlebar')
      const onTitlebar = titlebar && (e.target === titlebar || titlebar.contains(e.target as Node))
      if (onTitlebar) {
        paneEl.setAttribute('data-drop-zone', 'swap')
      } else {
        const zone = resolveDropZone(e, paneEl)
        paneEl.setAttribute('data-drop-zone', zone)
      }
    }
  }

  const handleDragLeave = (e: DragEvent) => {
    const paneEl = e.currentTarget as HTMLElement
    // Only remove if we actually left the pane (not entering a child)
    if (!paneEl.contains(e.relatedTarget as Node)) {
      paneEl.removeAttribute('data-drop-zone')
    }
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    const paneEl = e.currentTarget as HTMLElement
    paneEl.removeAttribute('data-drop-zone')

    // Pane-to-pane rearrange
    const sourcePaneId = getDragPaneData(e)
    if (sourcePaneId && sourcePaneId !== leaf.id) {
      // Drop on titlebar = swap contents
      const titlebar = paneEl.querySelector('.split-pane__titlebar')
      const onTitlebar = titlebar && (e.target === titlebar || titlebar.contains(e.target as Node))
      if (onTitlebar) {
        state.swapPanes(sourcePaneId, leaf.id)
      } else {
        // Body edge drop = move source beside target
        const zone = resolveDropZone(e, paneEl)
        const direction = zone === 'left' || zone === 'right' ? 'horizontal' : 'vertical'
        const position = zone === 'left' || zone === 'top' ? 'before' : 'after'
        state.movePaneBeside(sourcePaneId, leaf.id, direction, position)
      }
      return
    }

    // Session drag from sidebar
    const sessionKey = getDragData(e)
    if (!sessionKey) return
    const zone = resolveDropZone(e, paneEl)
    const direction = dropZoneToDirection(zone)
    if (direction) {
      state.focusPane(leaf.id)
      state.splitPane(direction)
      if (state.focusedPaneId) {
        state.setThreadInPane(state.focusedPaneId, sessionKey)
      }
    } else {
      state.setThreadInPane(leaf.id, sessionKey)
    }
  }

  const handleTitlebarDragStart = (e: DragEvent) => {
    setDragPaneData(e, leaf.id)
    // Subtle ghost effect
    if (e.dataTransfer) {
      const titlebar = e.currentTarget as HTMLElement
      e.dataTransfer.setDragImage(titlebar, titlebar.offsetWidth / 2, titlebar.offsetHeight / 2)
    }
  }

  // -- Context menu --
  const paneCount = state.splitLayout
    ? allLeafIds(state.splitLayout.root).length
    : 1
  const isMultiPane = paneCount > 1

  const ctxCallbacks: PaneContextMenuCallbacks = {
    onSplitHorizontal: () => {
      state.focusPane(leaf.id)
      state.splitPane('horizontal')
    },
    onSplitVertical: () => {
      state.focusPane(leaf.id)
      state.splitPane('vertical')
    },
    onClosePane: () => {
      state.closePane(leaf.id)
    },
    onNewThread: () => {
      // Create a thread without switching the global active session
      const parentKey = state.sessionKey
      const desc = createThreadDescriptor(parentKey)
      const thread = createThreadState(desc)
      state.threads.set(desc.id, thread)
      state.sessionKeyToThreadId.set(desc.sessionKey, desc.id)
      saveThreadDescriptors(state.getThreadDescriptors())
      state.threads = new Map(state.threads)
      state.setThreadInPane(leaf.id, desc.sessionKey)
    },
    onFocusNext: () => {
      state.focusNextPane()
    },
  }

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault()
    state.focusPane(leaf.id)
    const paneEl = e.currentTarget as HTMLElement
    const menu = paneEl.querySelector('pane-context-menu') as
      import('../components/pane-context-menu').PaneContextMenu | null
    if (menu) {
      menu.callbacks = ctxCallbacks
      menu.show(e.clientX, e.clientY, {
        showClosePane: isMultiPane,
        showFocusNext: isMultiPane,
      })
    }
  }

  // Resolve the display title for this pane
  const sessionEntry = state.sessionsResult?.sessions?.find(
    (s) => s.key === sessionKey,
  )
  const paneTitle =
    sessionEntry?.displayName ||
    sessionEntry?.label ||
    humanizeSessionKey(sessionKey)
  const isStreaming = isActiveSession
    ? Boolean(state.chatStream)
    : Boolean(thread?.chatStream)
  const msgCount = isActiveSession
    ? state.chatMessages.length
    : (thread?.chatMessages.length ?? 0)

  return html`
    <div
      class="split-pane ${isFocused ? 'split-pane--focused' : ''}"
      data-pane-id=${leaf.id}
      @click=${() => state.focusPane(leaf.id)}
      @focusin=${() => state.focusPane(leaf.id)}
      @dragover=${handleDragOver}
      @dragleave=${handleDragLeave}
      @drop=${handleDrop}
      @contextmenu=${handleContextMenu}
    >
      <div
        class="split-pane__titlebar ${isFocused ? 'split-pane__titlebar--focused' : ''}"
        draggable="true"
        @dragstart=${handleTitlebarDragStart}
      >
        <span class="split-pane__titlebar-label" title=${sessionKey}>
          ${paneTitle}
        </span>
        <span class="split-pane__titlebar-meta">
          ${isStreaming
            ? html`<span class="split-pane__titlebar-status split-pane__titlebar-status--streaming">streaming</span>`
            : msgCount > 0
              ? html`<span class="split-pane__titlebar-status">${msgCount} msgs</span>`
              : html`<span class="split-pane__titlebar-status split-pane__titlebar-status--empty">empty</span>`}
        </span>
        <button
          class="split-pane__titlebar-reset"
          title="Reset session"
          @click=${(e: Event) => {
            e.stopPropagation()
            state.chatMessage = ''
            state.chatMessages = []
            state.chatToolMessages = []
            state.chatStream = null
            state.chatStreamStartedAt = null
            state.chatRunId = null
            state.resetToolStream()
            state.resetChatScroll()
          }}
        ><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8a6 6 0 0110.472-4"/><path d="M14 8a6 6 0 01-10.472 4"/><path d="M12.5 1v3.5H9"/><path d="M3.5 15v-3.5H7"/></svg></button>
        <button
          class="split-pane__titlebar-archive"
          title="Archive session"
          @click=${(e: Event) => {
            e.stopPropagation()
            void patchSession(state, sessionKey, { archived: true })
            state.closePane(leaf.id)
          }}
        ><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="1" width="12" height="4" rx="1"/><path d="M2 5v8a2 2 0 002 2h8a2 2 0 002-2V5"/><path d="M8 8v4m0 0l2-2m-2 2l-2-2"/></svg></button>
        <button
          class="split-pane__titlebar-close"
          title="Close pane"
          @click=${(e: Event) => {
            e.stopPropagation()
            state.closePane(leaf.id)
          }}
        >&times;</button>
      </div>
      ${renderChat(chatProps)}
      <pane-context-menu .callbacks=${ctxCallbacks}></pane-context-menu>
    </div>
  `
}
