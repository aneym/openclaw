# kOS Implementation Tasks

## Section 1: Panel Engine (KOS-7)
> Spec: `specs/SPEC-kos-panels.md` | PRD: KOS-7

- [ ] Build PanelContainer that recursively renders PanelLayout tree using react-resizable-panels (PanelGroup, Panel, PanelResizeHandle). Default: single chat panel placeholder.
- [ ] Build PanelToolbar with title, split right/down buttons, and close button. Show on hover, 32px height.
- [ ] Implement panel store operations: splitPanel, closePanel, updatePanelProps, resetLayout. Wire up persistence to localStorage with `kos-panels` key.
- [ ] Build PanelContent switch component that renders the correct stub for each PanelType (chat, code-editor, terminal, coding-session, linear-board, browser, preview, diff, empty).
- [ ] Wire PanelContainer into Shell.tsx — main content area renders active thread's panel layout.

## Section 2: Thread System (KOS-7, KOS-13)
> Spec: `specs/SPEC-kos-panels.md` | PRD: KOS-7, KOS-13

- [ ] Build ThreadList component for sidebar — threads grouped by project, sorted by lastMessageAt. Collapsible project sections.
- [ ] Build ThreadItem with title, relative timestamp, status dot (streaming/idle/unread).
- [ ] Wire thread switching: click thread → set active thread → load its panel layout in PanelContainer.
- [ ] Build NewThreadButton that creates a session via gateway RPC and activates it.
- [ ] Build ThreadSearch overlay (Cmd+K) with fuzzy matching on thread titles using cmdk.

## Section 3: Chat UI — Core (KOS-13, KOS-8)
> Spec: `specs/SPEC-kos-chat.md` | PRD: KOS-13, KOS-8

- [ ] Install markdown dependencies: `marked`, `dompurify`, `highlight.js`. Add @types/dompurify.
- [ ] Build message normalization layer (gateway/normalize.ts) — convert raw gateway messages to ChatMessage parts model.
- [ ] Build useMessages hook — fetch history via gateway RPC on mount, subscribe to new messages via gateway events.
- [ ] Build useStreaming hook — track streaming state per session (stream.start, stream.delta, stream.end events).
- [ ] Build MessageList with auto-scroll (IntersectionObserver on sentinel element). "New messages" badge when scrolled up.
- [ ] Build MessageGroup — groups consecutive same-role messages. Avatar + grouped bubbles + timestamp footer.
- [ ] Build TextPart — markdown rendering with marked.js + DOMPurify + highlight.js syntax highlighting. Code blocks get copy button.
- [ ] Build ComposeBar — auto-resizing textarea, Enter=send, Shift+Enter=newline. Send via gateway RPC. Disable when disconnected.
- [ ] Wire ChatPanel together: MessageList + ComposeBar. Replace the chat stub in PanelContent.

## Section 4: Chat UI — Advanced (KOS-13, KOS-5)
> Spec: `specs/SPEC-kos-chat.md` | PRD: KOS-13, KOS-5

- [ ] Build ToolCallChip — compact chip with icon per tool type (📖 Read, ✏️ Edit, 📝 Write, ⚡ exec, 🔍 search, 🌐 fetch, 🔧 default).
- [ ] Build ToolCallGroup — collapsed by default ("🔧 3 tool calls"), expand to show individual chips.
- [ ] Build ReasoningBlock — collapsible "Thought for Xs..." block with purple accent.
- [ ] Build ImageAttachment — inline image display, clickable for full-size.
- [ ] Build MessageQueue — shows queued messages above compose bar when agent is streaming. "Send Now" (abort + send) and "Clear All" buttons.
- [ ] Build image paste handler in ComposeBar — clipboard paste detection, compression (max 1568px, JPEG quality stepping, 4MB budget), preview thumbnails.
- [ ] Build StreamingIndicator — three-dot animated reading indicator for empty streams.

## Section 5: Linear Board (KOS-2, KOS-4)
> Spec: `specs/SPEC-kos-nav.md` | PRD: KOS-2, KOS-4

- [ ] Build Linear GraphQL client (src/renderer/src/linear/) — fetch team issues with states, priorities, assignees, labels, relations. Use workspace config for API key.
- [ ] Build useLinearTeam hook — fetches issues for a team, caches with background refetch (60s). Returns issues + states + loading state.
- [ ] Build dependency graph (useDependencyGraph) — build DAG from `blocks` relations. Expose isBlocked, getBlockers, getUnblockedTasks, getDownstreamCount, getCriticalPath.
- [ ] Build LinearBoard kanban component — columns per Linear state, cards sorted by priority then dependency depth.
- [ ] Build LinearCard — shows identifier, title, priority icon, assignee, labels. Blocked cards get reduced opacity + "⛔ Blocked" badge. Downstream count badge.
- [ ] Build drag-and-drop between columns — optimistic state update + Linear API mutation.
- [ ] Build task→thread routing: click card → find existing thread or create new one, activate it.
- [ ] Wire LinearBoard as a panel type in PanelContent. Show when project has Linear team linked.

## Section 6: Project Navigation (KOS-7, KOS-13)
> Spec: `specs/SPEC-kos-nav.md` | PRD: KOS-7, KOS-13

- [ ] Build ProjectList in sidebar — expandable projects with thread count badge.
- [ ] Build WorkspaceSwitcher dropdown at top of sidebar — shows active workspace, switch between workspaces.
- [ ] Build ProjectSettings modal/drawer — project name, icon, color, Linear team connection, repo path, enabled skills.
- [ ] Wire project click behavior: expand to show threads, or show Linear board in main area if no active thread.

## Section 7: Coding Session Panel (KOS-5)
> Spec: `specs/SPEC-kos-chat.md` | PRD: KOS-5

- [ ] Build CodingSessionPanel — monitors agent coding sessions in real-time. Header with phase indicator + session name + duration.
- [ ] Build phase detection (useCodingSession hook) — parse tool events to detect phase: exploring (Read/search), planning (long text), building (Write/Edit/exec), testing (exec with test commands), complete, error.
- [ ] Build SessionTimeline — event timeline within a session. Each event shows tool icon + description + duration.
- [ ] Build PhaseIndicator — colored badge per phase (🔍 blue, 🧠 purple, 🔨 amber, 🧪 green, ✅ green, ❌ red).
- [ ] Wire CodingSessionPanel into PanelContent as the 'coding-session' panel type.

## Section 8: Keyboard Shortcuts & Polish
> PRD: KOS-7, KOS-8

- [ ] Implement keyboard shortcuts: Cmd+\ (toggle sidebar), Cmd+K (thread search), Cmd+N (new thread), Cmd+W (close panel), Cmd+Shift+\ (split panel right).
- [ ] Build notification toasts for important events (connection lost/restored, thread created, errors). Use shadcn toast/sonner.
- [ ] Add panel open/close animations (200ms ease-out transitions).
- [ ] Improve StatusBar — show active agent status, session info, current model.
- [ ] Polish sidebar — active states, hover effects, smooth transitions, proper spacing.
