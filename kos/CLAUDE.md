# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Is kOS

kOS is a desktop AI workspace app built with Electron + React. It's the primary UI for the Kinetic engineering workflow system — an AI-powered project management and coding agent orchestration tool. It connects to the OpenClaw gateway via WebSocket for real-time communication with AI agents.

**Product vision:** A local-first workspace with workspaces (Work/Personal), projects with skill-based capabilities, Linear integration for task management, adaptive panel layouts, and coding agent session management (Claude Code, Codex). See the Linear project "kOS — Product Definition" (KOS-1 through KOS-17) for full PRDs.

**Current state:** Scaffold with theme system, workspace/thread stores, gateway client, sidebar navigation, and settings UI. Chat UI and task views are not yet implemented.

## Tech Stack

- **Electron** 39 + **React** 19 + **TypeScript** 5.9
- **Build**: electron-vite (Vite 7) — separate configs for main, preload, renderer
- **Styling**: Tailwind CSS v4 + shadcn/ui (new-york style, 27 components) + CSS custom properties for theming
- **State**: Zustand v5 with `persist` middleware (localStorage, `kos-*` prefixed keys)
- **Gateway**: Custom WebSocket client (`src/renderer/src/gateway/client.ts`) connecting to OpenClaw gateway
- **Panels**: react-resizable-panels (for future adaptive panel layout)
- **Command palette**: cmdk
- **Icons**: lucide-react

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

| Store | Key | Persistence | Purpose |
|-------|-----|-------------|---------|
| `useThemeStore` | `kos-themes` | localStorage | Active theme, mode (light/dark/system), installed themes |
| `useWorkspaceStore` | `kos-workspaces` | localStorage | Workspace list, active workspace, gateway URL/token |
| `useThreadStore` | `kos-threads` | localStorage | Threads Map, active thread ID (custom Map serialization) |
| `useGatewayStore` | — | Not persisted | WebSocket client, connection state, request/subscribe methods |
| `usePanelStore` | — | Not persisted | Panel layout state (TODO) |

### Gateway Client

The gateway client (`gateway/client.ts`) implements the OpenClaw WebSocket protocol v3:
- Authenticates with token-only auth (no device identity)
- Client ID: `"kos"`, mode: `"webchat"`, role: `"operator"`
- Supports request/response RPC and server-push events with sequence gap detection
- Auto-reconnects with exponential backoff (800ms → 15s cap)

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

## Key Decisions

- **Fresh build**: Not a fork of OpenClaw's webchat UI — carries forward architectural patterns (session routing, WebSocket protocol) but UI is built from scratch
- **Local-first**: Each user runs their own instance; no centralized server
- **Electron-first**: Desktop app with hidden inset titlebar on macOS; web fallback not a priority
- **Thread-based navigation**: Threads are the atomic unit; auto-sorted into projects silently by the agent
- **Adaptive panels**: Panels appear based on activity and persist layout per-thread
