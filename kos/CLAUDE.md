# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Is kOS

kOS is a desktop AI workspace app built with Electron + React. It's the primary UI for the Kinetic engineering workflow system — an AI-powered project management and coding agent orchestration tool. It connects to the OpenClaw gateway via WebSocket for real-time communication with AI agents.

**Product vision:** A local-first workspace with workspaces (Work/Personal), projects with skill-based capabilities, Linear integration for task management, adaptive panel layouts, and coding agent session management (Claude Code, Codex).

**Current state:** Scaffold with theme system, workspace/thread stores, gateway client, sidebar navigation, and settings UI. Chat UI, panels, Linear board, and task views are not yet implemented.

## Product Requirements (Linear)

All PRDs live in Linear under the KOS team (KOS-1 through KOS-17). **Read them directly:**

```bash
# List all KOS issues
~/clawd/skills/linear/scripts/linear.sh team KOS

# Read a specific PRD
~/clawd/skills/linear/scripts/linear.sh issue KOS-7

# Check status, update issues
~/clawd/skills/linear/scripts/linear.sh status KOS-7 progress
```

**Key PRDs for UI implementation:**

- KOS-1: Data Model & Core Architecture (✅ done — types + stores)
- KOS-2: Linear Integration (kanban board, dependency graph, GraphQL client)
- KOS-4: Task Lifecycle & Stage System (stage metadata, priority scoring)
- KOS-5: Agent Session Management (monitoring UI, phase detection, session artifacts)
- KOS-7: UI Layout & Navigation (shell, sidebar, workspace switcher, adaptive panels)
- KOS-8: Task View (per-task workspace, chat + artifact panels)
- KOS-9: QA & Preview System (preview panel shells — embedded browser/simulator stubs)
- KOS-12: Notifications & Comms (in-app notification center, toast notifications)
- KOS-13: Chat Entry & Project Organization (chat UI, auto-sort, message rendering)

Read the PRD before implementing each feature. The PRDs are the source of truth for product intent.

## Implementation Specs

Detailed technical specs are in `specs/` within this directory:

- `SPEC-kos-panels.md` — Panel engine (react-resizable-panels), thread system, adaptive triggers
- `SPEC-kos-nav.md` — Project navigation, Linear kanban, dependency graph, workspace switcher
- `SPEC-kos-chat.md` — Chat UI, message rendering, tool chips, streaming, compose bar, coding session panel
- `kos-reference-patterns.md` — Research on 7 OSS AI chat UIs with adoption recommendations

These provide implementation-level detail. When a spec and PRD conflict, the PRD wins on product intent; the spec wins on technical approach.

## Tech Stack

- **Electron** 39 + **React** 19 + **TypeScript** 5.9
- **Build**: electron-vite (Vite 7) — separate configs for main, preload, renderer
- **Styling**: Tailwind CSS v4 + shadcn/ui (new-york style, 27 components) + CSS custom properties for theming
- **State**: Zustand v5 with `persist` middleware (localStorage, `kos-*` prefixed keys)
- **Gateway**: Custom WebSocket client (`src/renderer/src/gateway/client.ts`) connecting to OpenClaw gateway
- **Panels**: react-resizable-panels (already installed)
- **Command palette**: cmdk (already installed)
- **Icons**: lucide-react
- **Markdown**: Install `marked` + `dompurify` + `highlight.js` when needed

## Commands

```bash
npm install                  # Install dependencies
npm run dev                  # Start Electron with HMR
npm run build                # Typecheck + build
npm run typecheck            # Both node and web typechecks
npm run typecheck:node       # Typecheck main/preload (tsconfig.node.json)
npm run typecheck:web        # Typecheck renderer (tsconfig.web.json)
npm run lint                 # ESLint with cache
npm run format               # Prettier
npm run build:mac            # Build macOS app (no typecheck — just vite build + electron-builder)
```

Add shadcn components via: `bunx shadcn@latest add [component]`

## Architecture

```
src/
├── main/                     # Electron main process
│   ├── index.ts              # Window creation, app lifecycle, hidden titlebar
│   └── window-state.ts       # Persist window size/position across restarts
├── preload/                  # Context-isolated bridge (electron-toolkit)
└── renderer/src/             # React app (all UI code lives here)
    ├── App.tsx               # Root: theme init, gateway connect on workspace change
    ├── main.tsx              # React entry point
    ├── styles/globals.css    # Tailwind v4 import + CSS variable theme definitions
    ├── types/                # Shared TypeScript interfaces
    ├── stores/               # Zustand stores (see below)
    ├── hooks/                # Custom hooks (use-theme.ts)
    ├── lib/                  # Theme system (applier, installer, built-in themes), utils
    ├── gateway/              # OpenClaw gateway WebSocket client + types
    └── components/
        ├── layout/           # Shell, Sidebar, StatusBar
        ├── settings/         # Appearance settings, theme preview/install
        └── ui/               # shadcn components (27 total)
```

### Zustand Stores

StoreKeyPersistencePurpose`useThemeStorekos-themes`localStorageActive theme, mode (light/dark/system), installed themes`useWorkspaceStorekos-workspaces`localStorageWorkspace list, active workspace, gateway URL/token`useThreadStorekos-threads`localStorageThreads Map, active thread ID (custom Map serialization)`useGatewayStore`—Not persistedWebSocket client, connection state, request/subscribe methods`usePanelStorekos-panels`localStoragePanel layouts per thread (TODO — wire up persistence)

### Gateway Client

The gateway client (`gateway/client.ts`) implements the OpenClaw WebSocket protocol v3:

- Default URL: `ws://localhost:18789` (OpenClaw gateway default port)
- Authenticates with token-only auth (no device identity)
- Client ID: `"kos"`, mode: `"webchat"`, role: `"operator"`
- Supports request/response RPC and server-push events with sequence gap detection
- Auto-reconnects with exponential backoff (800ms → 15s cap)
- WebSocket upgrades at the HTTP server root — no path component needed

### Theme System

Multi-theme support with OKLch color space CSS variables:

- **Built-in themes**: Default + Amber Minimal (in `lib/built-in-themes.ts`)
- **Custom themes**: Installable from tweakcn.com URLs or raw JSON
- **Application**: `theme-applier.ts` sets CSS custom properties on `<html>` + toggles `.dark` class
- **Resolution**: `use-theme.ts` resolves `system` mode via `matchMedia`, listens for OS changes

## Code Style

- **Formatting**: Prettier — single quotes, no semicolons, 100 char width, no trailing commas
- **Imports**: `@/` and `@renderer/` both alias to `src/renderer/src/`
- **Components**: Named exports (except page components). Props interface above component.
- **shadcn style**: new-york variant, Radix UI primitives, CVA for variants

## Vercel React Best Practices

Apply these patterns from the `vercel-react-best-practices` and `vercel-composition-patterns` skills:

### Zustand Selectors (CRITICAL)

**Never call methods inside selectors** — this causes infinite re-render loops.

```tsx
// ❌ WRONG — calling getThread() in selector creates new reference each render
const thread = useThreadStore((s) => s.getThread(threadId));

// ✅ CORRECT — select raw Map, derive value with useMemo
const threadsMap = useThreadStore((s) => s.threads);
const thread = useMemo(() => threadsMap.get(threadId), [threadsMap, threadId]);
```

Apply this pattern for all Zustand stores with Map/Set data:

- `useThreadStore` → select `threads` Map
- `usePanelStore` → select `layouts` Map
- `useProjectStore` → select `projects` Map, `expandedProjectIds` Set

### React 19 Patterns

kOS uses React 19.2 — follow these patterns:

- Use `use(Context)` instead of `useContext(Context)`
- No need for `forwardRef` — ref is now a regular prop
- `use()` can be called conditionally

### Composition Patterns

**Avoid boolean prop proliferation:**

```tsx
// ❌ WRONG — exponential complexity
<Composer isThread isDMThread={false} isEditing showAttachments />

// ✅ CORRECT — explicit variants
<ThreadComposer channelId="abc" />
<EditComposer messageId="xyz" />
```

**Use compound components for complex UI:**

```tsx
// Structure as: Namespace.Subcomponent
<Panel.Frame>
  <Panel.Header />
  <Panel.Content />
</Panel.Frame>
```

**Lift state to providers when siblings need access:**

```tsx
// Provider boundary enables state sharing across non-nested components
<ComposerProvider>
  <Composer.Input />
  <MessagePreview /> {/* Can access composer state */}
  <SubmitButton /> {/* Can call submit action */}
</ComposerProvider>
```

### Performance Rules (by priority)

1. **Eliminating waterfalls**: Use `Promise.all()` for parallel fetches, move `await` into branches
2. **Bundle optimization**: Direct imports (no barrel files), `next/dynamic` for heavy components
3. **Re-render optimization**: Use `useMemo` for expensive derivations, primitive deps in effects
4. **Rendering**: Use ternary `{cond ? <A/> : <B/>}` not `{cond && <A/>}` for conditionals

## Key Decisions

- **Fresh build**: Not a fork of OpenClaw's webchat UI — carries forward architectural patterns (session routing, WebSocket protocol) but UI is built from scratch
- **Local-first**: Each user runs their own instance; no centralized server
- **Electron-first**: Desktop app with hidden inset titlebar on macOS; web fallback not a priority
- **Thread-based navigation**: Threads are the atomic unit; auto-sorted into projects silently by the agent
- **Adaptive panels**: Panels appear based on activity and persist layout per-thread
- **Parts-based message model**: Messages use typed `parts[]` (text, tool-call, tool-result, reasoning, image, audio) — see `types/message.ts`

## OpenClaw Backend Reference

kOS connects to the OpenClaw gateway. Key backend source locations (relative to `../` — the parent openclaw repo):

AreaPathPurposeGateway server`src/gateway/`HTTP + WebSocket server, session management, agent dispatchWebSocket protocol`src/gateway/server-runtime-state.ts`WebSocket server setup (`noServer` mode, upgrade handling)HTTP server`src/gateway/server-http.ts`HTTP endpoints + WebSocket upgrade handlerWeb UI (reference)`ui/src/`Existing Lit.js web UI — reference for gateway protocol usageWeb UI storage`ui/src/ui/storage.ts`Gateway URL resolution logic (dev: `ws://localhost:18789`)Agent dispatch`src/agents/runtime-dispatcher.ts`Pi vs Claude SDK agent routingSession routing`src/routing/`Channel + account + peer ID → agent matchingConfig schema`src/config/`Zod-validated JSON5 config with hot-reloadGateway types`src/gateway/protocol/`WebSocket frame types and validation

The existing web UI at `ui/src/` is built with Lit.js (not React) and served by the gateway at `/`. kOS replaces this with a standalone Electron app but uses the same WebSocket protocol. Study `ui/src/` for protocol usage patterns when implementing new gateway interactions.

## Safety Constraints

**CRITICAL: Only modify files inside** `kos/`**. Never modify files outside this directory.**

- All code changes must be within the `kos/` directory tree
- You may READ files outside `kos/` for reference (e.g., `../ui/src/` for gateway protocol patterns, `../src/gateway/` for backend reference)
- You may READ Linear PRDs via `~/clawd/skills/linear/scripts/linear.sh`
- Do NOT modify the parent openclaw repo, gateway code, or any files outside `kos/`
- Do NOT modify `.git/` or any git config outside normal commits
- Install npm packages only within `kos/` (run `npm install` from `kos/`)
