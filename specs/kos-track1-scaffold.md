# kOS Track 1: Electron App Scaffold — Implementation Spec

**Status:** Draft  
**Created:** 2026-02-02  
**Track:** 1 of N (foundational — all other tracks depend on this)

## Overview

Build the foundational Electron + React scaffold for kOS, a general-purpose AI workspace. This track produces a running Electron app that connects to the OpenClaw gateway via WebSocket, renders a React shell with Tailwind/shadcn styling, and persists state across restarts via Zustand.

**Architecture principle:** Gateway = brain, Electron = body, Zustand persist = backbone.

---

## 1. Directory Structure

All files live under `kos/` in the OpenClaw monorepo root (`/Users/aneyman/bot/openclaw/kos/`).

```
kos/
├── package.json
├── tsconfig.json                    # Base TS config (extends paths)
├── tsconfig.node.json               # TS config for main + preload (Node target)
├── tsconfig.web.json                # TS config for renderer (DOM target)
├── electron.vite.config.ts          # electron-vite unified config
├── tailwind.config.ts               # Tailwind v4 config
├── postcss.config.js                # PostCSS (tailwindcss + autoprefixer)
├── components.json                  # shadcn/ui config (created by `npx shadcn@latest init`)
├── electron-builder.yml             # electron-builder config (build/package)
├── resources/                       # App icons, native assets
│   └── icon.png                     # 1024x1024 app icon (placeholder)
├── src/
│   ├── main/                        # Electron main process
│   │   ├── index.ts                 # Entry: app lifecycle, window creation, IPC registration
│   │   └── window-state.ts          # Window bounds/maximized persistence to disk
│   ├── preload/                     # Preload script (contextBridge)
│   │   ├── index.ts                 # Exposes IPC bridge to renderer via contextIsolation
│   │   └── index.d.ts              # Type declarations for window.api
│   └── renderer/                    # React renderer process
│       ├── index.html               # HTML entry (Vite injects script)
│       ├── src/
│       │   ├── main.tsx             # React root mount
│       │   ├── App.tsx              # Root component with router/layout
│       │   ├── env.d.ts             # Vite/electron env type augmentations
│       │   ├── globals.css          # Tailwind directives + shadcn CSS variables
│       │   ├── lib/
│       │   │   └── utils.ts         # shadcn cn() utility
│       │   ├── gateway/
│       │   │   ├── client.ts        # GatewayClient class (ported from ui/src/ui/gateway.ts)
│       │   │   ├── types.ts         # Gateway frame types, hello-ok, events
│       │   │   ├── useGateway.ts    # React hook wrapping the client
│       │   │   └── auth.ts          # Device identity + auth token persistence
│       │   ├── stores/
│       │   │   ├── connection.ts    # Gateway connection state (zustand)
│       │   │   ├── workspace.ts     # Workspace/session metadata (zustand + persist)
│       │   │   ├── threads.ts       # Thread list + active thread (zustand + persist)
│       │   │   └── layout.ts        # Layout/pane state (zustand + persist)
│       │   ├── components/
│       │   │   └── ui/              # shadcn/ui generated components land here
│       │   └── pages/
│       │       └── Home.tsx         # Placeholder home page
│       └── public/                  # Static assets for renderer
└── dev-app-update.yml               # electron-updater dev config (placeholder)
```

---

## 2. Package Configuration

### `kos/package.json`

```jsonc
{
  "name": "kos",
  "version": "0.1.0",
  "private": true,
  "main": "./out/main/index.js",
  "type": "module",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "postinstall": "electron-builder install-app-deps",
    "typecheck:node": "tsc --noEmit -p tsconfig.node.json",
    "typecheck:web": "tsc --noEmit -p tsconfig.web.json",
    "typecheck": "npm run typecheck:node && npm run typecheck:web",
    "lint": "eslint . --ext .ts,.tsx"
  },
  "dependencies": {
    "@noble/ed25519": "3.0.0"
  },
  "devDependencies": {
    "@electron-toolkit/preload": "^3.0.0",
    "@electron-toolkit/utils": "^3.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.4.20",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "electron": "^34.0.0",
    "electron-builder": "^25.0.0",
    "electron-vite": "^3.1.0",
    "lucide-react": "^0.460.0",
    "postcss": "^8.5.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.1.0",
    "tailwind-merge": "^2.6.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.0",
    "vite": "^7.3.0",
    "zustand": "^5.0.0"
  }
}
```

**Notes:**
- `@noble/ed25519` is a runtime dependency (used for device auth signing in renderer).
- `electron-vite` v3+ supports Vite 7 and provides unified config for main/preload/renderer.
- `@electron-toolkit/preload` provides `contextBridge` helpers; `@electron-toolkit/utils` provides `is.dev`, optimizer utils.
- Pin `electron` to latest stable (34.x at time of writing). Check `npm view electron version` before installing.

---

## 3. TypeScript Configuration

### `kos/tsconfig.json` (base)

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

### `kos/tsconfig.node.json` (main + preload)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "./out",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "composite": true
  },
  "include": ["src/main/**/*", "src/preload/**/*", "electron.vite.config.ts"]
}
```

### `kos/tsconfig.web.json` (renderer)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "outDir": "./out",
    "rootDir": "./src/renderer/src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "composite": true,
    "paths": {
      "@/*": ["./src/renderer/src/*"]
    }
  },
  "include": ["src/renderer/src/**/*"]
}
```

---

## 4. Electron-Vite Config

### `kos/electron.vite.config.ts`

```ts
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const GATEWAY_PORT = process.env.OPENCLAW_GATEWAY_PORT || '19001'
const GATEWAY_ORIGIN = `http://localhost:${GATEWAY_PORT}`

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src')
      }
    },
    define: {
      __KOS_DEV_GATEWAY_PORT__: JSON.stringify(GATEWAY_PORT)
    },
    server: {
      port: 5174, // Avoid conflict with existing ui/ on 5173
      strictPort: true,
      proxy: {
        '/api': { target: GATEWAY_ORIGIN, changeOrigin: true },
        '/avatar': { target: GATEWAY_ORIGIN, changeOrigin: true }
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    }
  }
})
```

**Key decisions:**
- Renderer dev server on port **5174** (existing ui/ uses 5173).
- `/api` and `/avatar` proxied to gateway — same pattern as `ui/vite.config.ts`.
- `__KOS_DEV_GATEWAY_PORT__` injected as a define for runtime gateway URL construction.
- WebSocket proxy is NOT needed in Vite config — the renderer connects to the gateway WebSocket directly (the gateway WS endpoint is on port 19001, not proxied through Vite). In dev mode, the renderer constructs the WS URL from `__KOS_DEV_GATEWAY_PORT__`.

---

## 5. Electron Main Process

### `kos/src/main/index.ts`

Responsibilities:
- Create the BrowserWindow
- Restore saved window bounds on startup
- Register IPC handlers
- Load renderer (dev server URL or built file)
- Handle app lifecycle (single instance, quit on all windows closed on non-macOS)

```ts
import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { loadWindowState, saveWindowState, type WindowState } from './window-state'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const savedState = loadWindowState()

  mainWindow = new BrowserWindow({
    width: savedState?.width ?? 1200,
    height: savedState?.height ?? 800,
    x: savedState?.x,
    y: savedState?.y,
    minWidth: 640,
    minHeight: 480,
    show: false, // Show after ready-to-show to avoid flash
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset', // macOS: native traffic lights, no title bar
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Restore maximized state after window creation
  if (savedState?.isMaximized) {
    mainWindow.maximize()
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Persist window state on close, move, resize
  const persistState = (): void => {
    if (!mainWindow) return
    const bounds = mainWindow.getBounds()
    const isMaximized = mainWindow.isMaximized()
    saveWindowState({ ...bounds, isMaximized })
  }

  mainWindow.on('resize', persistState)
  mainWindow.on('move', persistState)
  mainWindow.on('close', persistState)

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Dev: load from Vite dev server. Prod: load built HTML.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// IPC handlers
function registerIPC(): void {
  // Return the gateway URL for the renderer to connect to
  ipcMain.handle('get-gateway-url', () => {
    const port = process.env.OPENCLAW_GATEWAY_PORT || '19001'
    return `ws://localhost:${port}`
  })

  // Return the app version
  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })

  // Platform info
  ipcMain.handle('get-platform', () => {
    return process.platform
  })
}

app.whenReady().then(() => {
  registerIPC()
  createWindow()

  app.on('activate', () => {
    // macOS: re-create window on dock click
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
```

### `kos/src/main/window-state.ts`

Persists window bounds + maximized state to a JSON file in `app.getPath('userData')`.

```ts
import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

export interface WindowState {
  x: number
  y: number
  width: number
  height: number
  isMaximized: boolean
}

const STATE_FILE = join(app.getPath('userData'), 'window-state.json')

export function loadWindowState(): WindowState | null {
  try {
    const raw = readFileSync(STATE_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    // Basic validation
    if (
      typeof parsed.width === 'number' &&
      typeof parsed.height === 'number' &&
      parsed.width > 0 &&
      parsed.height > 0
    ) {
      return parsed as WindowState
    }
    return null
  } catch {
    return null
  }
}

export function saveWindowState(state: WindowState): void {
  try {
    mkdirSync(dirname(STATE_FILE), { recursive: true })
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8')
  } catch {
    // Non-critical: silently fail
  }
}
```

**Critical details:**
- `titleBarStyle: 'hiddenInset'` gives macOS native feel with integrated traffic lights.
- `contextIsolation: true` + `nodeIntegration: false` = secure by default.
- Window state saved on every move/resize/close — debouncing is optional but not needed for file writes this small.
- `show: false` + `ready-to-show` avoids white flash on startup.

---

## 6. Preload Script

### `kos/src/preload/index.ts`

Exposes a typed IPC bridge via `contextBridge`. The renderer accesses these as `window.api.*`.

```ts
import { contextBridge, ipcRenderer } from 'electron'

export const api = {
  /** Get the gateway WebSocket URL (e.g., ws://localhost:19001) */
  getGatewayUrl: (): Promise<string> => ipcRenderer.invoke('get-gateway-url'),

  /** Get the kOS app version */
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),

  /** Get the platform (darwin, win32, linux) */
  getPlatform: (): Promise<string> => ipcRenderer.invoke('get-platform'),

  /** Listen for events from main process */
  onMainEvent: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void => {
      callback(...args)
    }
    ipcRenderer.on(channel, subscription)
    return () => {
      ipcRenderer.removeListener(channel, subscription)
    }
  },
} as const

export type ElectronAPI = typeof api

contextBridge.exposeInMainWorld('api', api)
```

### `kos/src/preload/index.d.ts`

Type declaration for the renderer to consume:

```ts
import type { ElectronAPI } from './index'

declare global {
  interface Window {
    api: ElectronAPI
  }
}
```

---

## 7. Renderer — React App Shell

### `kos/src/renderer/index.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src ws://localhost:* http://localhost:*;"
    />
    <title>kOS</title>
  </head>
  <body class="bg-background text-foreground">
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
```

**CSP note:** `connect-src ws://localhost:* http://localhost:*` allows WebSocket + HTTP to gateway on any localhost port. Tighten in production.

### `kos/src/renderer/src/main.tsx`

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

### `kos/src/renderer/src/App.tsx`

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Home } from './pages/Home'
import { useGateway } from './gateway/useGateway'
import { useConnectionStore } from './stores/connection'

export function App(): React.ReactElement {
  // Initialize gateway connection
  useGateway()

  const status = useConnectionStore((s) => s.status)

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      {/* Draggable title bar region for macOS hiddenInset */}
      <div className="h-10 flex-shrink-0 app-drag-region" />

      {/* Status bar */}
      <div className="flex items-center gap-2 px-4 py-1 text-xs text-muted-foreground border-b">
        <span
          className={`h-2 w-2 rounded-full ${
            status === 'connected'
              ? 'bg-green-500'
              : status === 'connecting'
                ? 'bg-yellow-500 animate-pulse'
                : 'bg-red-500'
          }`}
        />
        <span>Gateway: {status}</span>
      </div>

      {/* Main content area */}
      <main className="flex-1 overflow-hidden">
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            {/* Future tracks add routes here */}
          </Routes>
        </BrowserRouter>
      </main>
    </div>
  )
}
```

**Notes on `app-drag-region`:** Add this CSS class for macOS frameless window dragging:
```css
.app-drag-region {
  -webkit-app-region: drag;
}
.app-drag-region button,
.app-drag-region a,
.app-drag-region input {
  -webkit-app-region: no-drag;
}
```

### `kos/src/renderer/src/pages/Home.tsx`

```tsx
import { useConnectionStore } from '../stores/connection'
import { useWorkspaceStore } from '../stores/workspace'

export function Home(): React.ReactElement {
  const { status, gatewayVersion } = useConnectionStore()
  const { agentId, sessionKey } = useWorkspaceStore()

  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">kOS</h1>
        <p className="text-muted-foreground">AI Workspace</p>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>Gateway: {status}{gatewayVersion ? ` (${gatewayVersion})` : ''}</p>
          {agentId && <p>Agent: {agentId}</p>}
          {sessionKey && <p className="font-mono text-xs">{sessionKey}</p>}
        </div>
      </div>
    </div>
  )
}
```

### `kos/src/renderer/src/globals.css`

```css
@import 'tailwindcss';

/* shadcn/ui CSS variables — these are generated by `npx shadcn@latest init` */
/* The exact values below are the "zinc" theme defaults; shadcn init will overwrite this file. */
/* Keep the @import and the app-drag-region class; shadcn will add its :root variables. */

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 240 10% 3.9%;
    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 240 5.9% 10%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 10% 3.9%;
    --card-foreground: 0 0% 98%;
    --popover: 240 10% 3.9%;
    --popover-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 240 5.9% 10%;
    --secondary: 240 3.7% 15.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --accent: 240 3.7% 15.9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --ring: 240 4.9% 83.9%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-feature-settings: "rlig" 1, "calt" 1;
  }
}

/* macOS frameless window drag region */
.app-drag-region {
  -webkit-app-region: drag;
}
.app-drag-region button,
.app-drag-region a,
.app-drag-region input {
  -webkit-app-region: no-drag;
}
```

### `kos/src/renderer/src/lib/utils.ts`

```ts
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
```

### `kos/src/renderer/src/env.d.ts`

```ts
/// <reference types="vite/client" />

declare const __KOS_DEV_GATEWAY_PORT__: string
```

---

## 8. Gateway WebSocket Client

Port from `ui/src/ui/gateway.ts` (the `GatewayBrowserClient` class). The kOS version is structurally identical but adapted for React consumption.

### `kos/src/renderer/src/gateway/types.ts`

```ts
/** Server → client event frame */
export interface GatewayEventFrame {
  type: 'event'
  event: string
  payload?: unknown
  seq?: number
  stateVersion?: { presence: number; health: number }
}

/** Server → client response frame */
export interface GatewayResponseFrame {
  type: 'res'
  id: string
  ok: boolean
  payload?: unknown
  error?: { code: string; message: string; details?: unknown }
}

/** Server → client hello-ok after successful connect */
export interface GatewayHelloOk {
  type: 'hello-ok'
  protocol: number
  server?: {
    version: string
    commit?: string
    host?: string
    connId: string
  }
  features?: { methods?: string[]; events?: string[] }
  snapshot?: GatewaySnapshot
  canvasHostUrl?: string
  auth?: {
    deviceToken?: string
    role?: string
    scopes?: string[]
    issuedAtMs?: number
  }
  policy?: {
    maxPayload?: number
    maxBufferedBytes?: number
    tickIntervalMs?: number
  }
}

/** Snapshot received on connect */
export interface GatewaySnapshot {
  presence: unknown[]
  health: unknown
  stateVersion: { presence: number; health: number }
  uptimeMs: number
  configPath?: string
  stateDir?: string
  sessionDefaults?: {
    defaultAgentId: string
    mainKey: string
    mainSessionKey: string
    scope?: string
  }
  slashCommands?: Array<{ name: string; description: string; category?: string }>
}

/** Client → server request frame */
export interface GatewayRequestFrame {
  type: 'req'
  id: string
  method: string
  params?: unknown
}

/** Connect params sent as the first RPC */
export interface GatewayConnectParams {
  minProtocol: number
  maxProtocol: number
  client: {
    id: string
    version: string
    platform: string
    mode: string
    instanceId?: string
  }
  role: string
  scopes: string[]
  device?: {
    id: string
    publicKey: string
    signature: string
    signedAt: number
    nonce?: string
  }
  caps: string[]
  auth?: {
    token?: string
    password?: string
  }
  userAgent?: string
  locale?: string
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'
```

### `kos/src/renderer/src/gateway/auth.ts`

Port of `ui/src/ui/device-identity.ts` and `ui/src/ui/device-auth.ts`. Uses `@noble/ed25519` for key generation and signing. Storage keys use `kos.` prefix to avoid collision with existing UI.

```ts
import { getPublicKeyAsync, signAsync, utils } from '@noble/ed25519'

// ─── Device Identity ───────────────────────────────────────────

interface StoredIdentity {
  version: 1
  deviceId: string
  publicKey: string
  privateKey: string
  createdAtMs: number
}

export interface DeviceIdentity {
  deviceId: string
  publicKey: string
  privateKey: string
}

const IDENTITY_KEY = 'kos.device.identity.v1'

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')
}

function base64UrlDecode(input: string): Uint8Array {
  const normalized = input.replaceAll('-', '+').replaceAll('_', '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export async function loadOrCreateDeviceIdentity(): Promise<DeviceIdentity> {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY)
    if (raw) {
      const stored: StoredIdentity = JSON.parse(raw)
      if (stored.version === 1 && stored.deviceId && stored.publicKey && stored.privateKey) {
        return { deviceId: stored.deviceId, publicKey: stored.publicKey, privateKey: stored.privateKey }
      }
    }
  } catch { /* regenerate */ }

  const privateKeyBytes = utils.randomPrivateKey()
  const publicKeyBytes = await getPublicKeyAsync(privateKeyBytes)
  const deviceId = crypto.randomUUID()
  const identity: StoredIdentity = {
    version: 1,
    deviceId,
    publicKey: base64UrlEncode(publicKeyBytes),
    privateKey: base64UrlEncode(privateKeyBytes),
    createdAtMs: Date.now(),
  }
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity))
  return { deviceId: identity.deviceId, publicKey: identity.publicKey, privateKey: identity.privateKey }
}

export async function signDevicePayload(privateKeyB64: string, payload: string): Promise<string> {
  const privateKey = base64UrlDecode(privateKeyB64)
  const encoder = new TextEncoder()
  const sig = await signAsync(encoder.encode(payload), privateKey)
  return base64UrlEncode(sig)
}

// ─── Device Auth Tokens ────────────────────────────────────────

interface DeviceAuthEntry {
  token: string
  role: string
  scopes: string[]
  updatedAtMs: number
}

interface DeviceAuthStore {
  version: 1
  deviceId: string
  tokens: Record<string, DeviceAuthEntry>
}

const AUTH_KEY = 'kos.device.auth.v1'

function loadAuthStore(deviceId: string): DeviceAuthStore {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (raw) {
      const parsed: DeviceAuthStore = JSON.parse(raw)
      if (parsed.version === 1 && parsed.deviceId === deviceId) return parsed
    }
  } catch { /* fresh store */ }
  return { version: 1, deviceId, tokens: {} }
}

export function loadDeviceAuthToken(opts: { deviceId: string; role: string }): DeviceAuthEntry | null {
  const store = loadAuthStore(opts.deviceId)
  return store.tokens[opts.role] ?? null
}

export function storeDeviceAuthToken(opts: {
  deviceId: string
  role: string
  token: string
  scopes: string[]
}): void {
  const store = loadAuthStore(opts.deviceId)
  store.tokens[opts.role] = {
    token: opts.token,
    role: opts.role,
    scopes: opts.scopes,
    updatedAtMs: Date.now(),
  }
  localStorage.setItem(AUTH_KEY, JSON.stringify(store))
}

export function clearDeviceAuthToken(opts: { deviceId: string; role: string }): void {
  const store = loadAuthStore(opts.deviceId)
  delete store.tokens[opts.role]
  localStorage.setItem(AUTH_KEY, JSON.stringify(store))
}

// ─── Auth Payload Builder ──────────────────────────────────────

export function buildDeviceAuthPayload(params: {
  deviceId: string
  clientId: string
  clientMode: string
  role: string
  scopes: string[]
  signedAtMs: number
  token?: string | null
  nonce?: string | null
}): string {
  const version = params.nonce ? 'v2' : 'v1'
  const base = [
    version,
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    params.scopes.join(','),
    String(params.signedAtMs),
    params.token ?? '',
  ]
  if (version === 'v2') base.push(params.nonce ?? '')
  return base.join('|')
}
```

### `kos/src/renderer/src/gateway/client.ts`

This is the direct port of `GatewayBrowserClient`. Key differences from the Lit UI version:
- Uses `kos.` storage prefix
- Client ID is `kos-desktop` (not `openclaw-control-ui`)
- No global singleton — instantiated per React lifecycle

```ts
import type {
  GatewayEventFrame,
  GatewayResponseFrame,
  GatewayHelloOk,
  ConnectionStatus,
} from './types'
import {
  loadOrCreateDeviceIdentity,
  signDevicePayload,
  buildDeviceAuthPayload,
  loadDeviceAuthToken,
  storeDeviceAuthToken,
  clearDeviceAuthToken,
  type DeviceIdentity,
} from './auth'

type Pending = {
  resolve: (value: unknown) => void
  reject: (err: unknown) => void
}

export interface GatewayClientOptions {
  url: string
  token?: string
  password?: string
  clientVersion?: string
  instanceId?: string
  onHello?: (hello: GatewayHelloOk) => void
  onEvent?: (evt: GatewayEventFrame) => void
  onClose?: (info: { code: number; reason: string }) => void
  onGap?: (info: { expected: number; received: number }) => void
  onStatusChange?: (status: ConnectionStatus) => void
}

const CLIENT_ID = 'kos-desktop'
const CLIENT_MODE = 'ui'
const ROLE = 'operator'
const SCOPES = ['operator.admin', 'operator.approvals', 'operator.pairing']
const CONNECT_FAILED_CLOSE_CODE = 4008

export class GatewayClient {
  private ws: WebSocket | null = null
  private pending = new Map<string, Pending>()
  private closed = false
  private lastSeq: number | null = null
  private connectNonce: string | null = null
  private connectSent = false
  private connectTimer: ReturnType<typeof setTimeout> | null = null
  private backoffMs = 800

  constructor(private opts: GatewayClientOptions) {}

  start(): void {
    this.closed = false
    this.opts.onStatusChange?.('connecting')
    this.connect()
  }

  stop(): void {
    this.closed = true
    if (this.connectTimer !== null) {
      clearTimeout(this.connectTimer)
      this.connectTimer = null
    }
    this.ws?.close()
    this.ws = null
    this.flushPending(new Error('gateway client stopped'))
    this.opts.onStatusChange?.('disconnected')
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  /** Send an RPC request and return the response payload */
  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('gateway not connected'))
    }
    const id = crypto.randomUUID()
    const frame = { type: 'req', id, method, params }
    const p = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (v) => resolve(v as T), reject })
    })
    this.ws.send(JSON.stringify(frame))
    return p
  }

  // ─── Private ──────────────────────────────────────────────

  private connect(): void {
    if (this.closed) return
    this.opts.onStatusChange?.('connecting')
    this.ws = new WebSocket(this.opts.url)
    this.ws.addEventListener('open', () => this.queueConnect())
    this.ws.addEventListener('message', (ev) => this.handleMessage(String(ev.data ?? '')))
    this.ws.addEventListener('close', (ev) => {
      this.ws = null
      this.flushPending(new Error(`gateway closed (${ev.code}): ${ev.reason ?? ''}`))
      this.opts.onClose?.({ code: ev.code, reason: ev.reason ?? '' })
      this.opts.onStatusChange?.('disconnected')
      this.scheduleReconnect()
    })
    this.ws.addEventListener('error', () => {
      // close handler fires after error
    })
  }

  private scheduleReconnect(): void {
    if (this.closed) return
    const delay = this.backoffMs
    this.backoffMs = Math.min(this.backoffMs * 1.7, 15_000)
    setTimeout(() => this.connect(), delay)
  }

  private flushPending(err: Error): void {
    for (const [, p] of this.pending) p.reject(err)
    this.pending.clear()
  }

  private queueConnect(): void {
    this.connectNonce = null
    this.connectSent = false
    if (this.connectTimer !== null) clearTimeout(this.connectTimer)
    // Wait 750ms for a connect.challenge event; if none arrives, send connect anyway
    this.connectTimer = setTimeout(() => void this.sendConnect(), 750)
  }

  private async sendConnect(): Promise<void> {
    if (this.connectSent) return
    this.connectSent = true
    if (this.connectTimer !== null) {
      clearTimeout(this.connectTimer)
      this.connectTimer = null
    }

    let deviceIdentity: DeviceIdentity | null = null
    let canFallbackToShared = false
    let authToken = this.opts.token

    try {
      deviceIdentity = await loadOrCreateDeviceIdentity()
      const storedToken = loadDeviceAuthToken({ deviceId: deviceIdentity.deviceId, role: ROLE })?.token
      if (storedToken) {
        canFallbackToShared = Boolean(this.opts.token)
        authToken = storedToken
      }
    } catch {
      // Fallback to token-only auth
    }

    const auth = authToken || this.opts.password
      ? { token: authToken, password: this.opts.password }
      : undefined

    let device: GatewayConnectParams['device'] | undefined
    if (deviceIdentity) {
      try {
        const signedAtMs = Date.now()
        const nonce = this.connectNonce ?? undefined
        const payload = buildDeviceAuthPayload({
          deviceId: deviceIdentity.deviceId,
          clientId: CLIENT_ID,
          clientMode: CLIENT_MODE,
          role: ROLE,
          scopes: SCOPES,
          signedAtMs,
          token: authToken ?? null,
          nonce,
        })
        const signature = await signDevicePayload(deviceIdentity.privateKey, payload)
        device = {
          id: deviceIdentity.deviceId,
          publicKey: deviceIdentity.publicKey,
          signature,
          signedAt: signedAtMs,
          nonce,
        }
      } catch {
        // Proceed without device auth
      }
    }

    const params = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: CLIENT_ID,
        version: this.opts.clientVersion ?? 'dev',
        platform: navigator.platform ?? 'electron',
        mode: CLIENT_MODE,
        instanceId: this.opts.instanceId,
      },
      role: ROLE,
      scopes: SCOPES,
      device,
      caps: [],
      auth,
      userAgent: navigator.userAgent,
      locale: navigator.language,
    }

    try {
      const hello = await this.request<GatewayHelloOk>('connect', params)
      if (hello?.auth?.deviceToken && deviceIdentity) {
        storeDeviceAuthToken({
          deviceId: deviceIdentity.deviceId,
          role: hello.auth.role ?? ROLE,
          token: hello.auth.deviceToken,
          scopes: hello.auth.scopes ?? [],
        })
      }
      this.backoffMs = 800
      this.opts.onStatusChange?.('connected')
      this.opts.onHello?.(hello)
    } catch {
      if (canFallbackToShared && deviceIdentity) {
        clearDeviceAuthToken({ deviceId: deviceIdentity.deviceId, role: ROLE })
      }
      this.ws?.close(CONNECT_FAILED_CLOSE_CODE, 'connect failed')
    }
  }

  private handleMessage(raw: string): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }

    const frame = parsed as { type?: string }

    if (frame.type === 'event') {
      const evt = parsed as GatewayEventFrame

      // Handle connect.challenge — gateway sends nonce before we can authenticate
      if (evt.event === 'connect.challenge') {
        const payload = evt.payload as { nonce?: string } | undefined
        if (payload?.nonce) {
          this.connectNonce = payload.nonce
          void this.sendConnect()
        }
        return
      }

      // Sequence gap detection
      const seq = typeof evt.seq === 'number' ? evt.seq : null
      if (seq !== null) {
        if (this.lastSeq !== null && seq > this.lastSeq + 1) {
          this.opts.onGap?.({ expected: this.lastSeq + 1, received: seq })
        }
        this.lastSeq = seq
      }

      try {
        this.opts.onEvent?.(evt)
      } catch (err) {
        console.error('[gateway] event handler error:', err)
      }
      return
    }

    if (frame.type === 'res') {
      const res = parsed as GatewayResponseFrame
      const pending = this.pending.get(res.id)
      if (!pending) return
      this.pending.delete(res.id)
      if (res.ok) {
        pending.resolve(res.payload)
      } else {
        pending.reject(new Error(res.error?.message ?? 'request failed'))
      }
    }
  }
}

// Re-export for inline use in sendConnect
type GatewayConnectParams = {
  device?: {
    id: string
    publicKey: string
    signature: string
    signedAt: number
    nonce?: string
  }
}
```

### `kos/src/renderer/src/gateway/useGateway.ts`

React hook that creates, manages, and cleans up the `GatewayClient` singleton. Bridges gateway events into Zustand stores.

```ts
import { useEffect, useRef } from 'react'
import { GatewayClient } from './client'
import { useConnectionStore } from '../stores/connection'
import { useWorkspaceStore } from '../stores/workspace'
import type { GatewayEventFrame, GatewayHelloOk } from './types'

// Singleton client ref — survives React strict mode double-mount
let globalClient: GatewayClient | null = null

/**
 * Construct the gateway WebSocket URL.
 * In dev: use the injected port define. In prod: use IPC to ask main process.
 * For simplicity in Track 1, we use the define (available in both dev and prod builds).
 */
function getGatewayWsUrl(): string {
  // __KOS_DEV_GATEWAY_PORT__ is injected by electron.vite.config.ts `define`
  const port = typeof __KOS_DEV_GATEWAY_PORT__ !== 'undefined' ? __KOS_DEV_GATEWAY_PORT__ : '19001'
  return `ws://localhost:${port}`
}

export function useGateway(): void {
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const setStatus = useConnectionStore.getState().setStatus
    const setGatewayInfo = useConnectionStore.getState().setGatewayInfo
    const setSnapshot = useWorkspaceStore.getState().setSnapshot
    const handleEvent = useConnectionStore.getState().handleEvent

    const url = getGatewayWsUrl()

    const client = new GatewayClient({
      url,
      instanceId: crypto.randomUUID(),
      onStatusChange: (status) => {
        setStatus(status)
      },
      onHello: (hello: GatewayHelloOk) => {
        setGatewayInfo({
          version: hello.server?.version,
          connId: hello.server?.connId,
          protocol: hello.protocol,
          features: hello.features,
        })
        if (hello.snapshot) {
          setSnapshot(hello.snapshot)
        }
      },
      onEvent: (evt: GatewayEventFrame) => {
        handleEvent(evt)
      },
      onGap: (info) => {
        console.warn('[gateway] sequence gap:', info)
        // Future: request snapshot refresh from gateway
      },
      onClose: (info) => {
        console.warn('[gateway] closed:', info)
      },
    })

    globalClient = client
    client.start()

    // Store client reference for RPC calls from other parts of the app
    useConnectionStore.getState().setClient(client)

    return () => {
      client.stop()
      globalClient = null
    }
  }, [])
}

/** Access the gateway client for making RPC calls from outside React components */
export function getGatewayClient(): GatewayClient | null {
  return globalClient
}
```

---

## 9. Zustand Stores

All stores use Zustand v5 with the `persist` middleware where state should survive restarts. Storage key prefix: `kos.`.

### `kos/src/renderer/src/stores/connection.ts`

Transient connection state — NOT persisted (reconnects fresh each launch).

```ts
import { create } from 'zustand'
import type { GatewayClient } from '../gateway/client'
import type { ConnectionStatus, GatewayEventFrame } from '../gateway/types'

interface GatewayInfo {
  version?: string
  connId?: string
  protocol?: number
  features?: { methods?: string[]; events?: string[] }
}

interface ConnectionState {
  status: ConnectionStatus
  gatewayVersion: string | null
  gatewayInfo: GatewayInfo | null
  client: GatewayClient | null
  lastEventSeq: number | null

  // Actions
  setStatus: (status: ConnectionStatus) => void
  setGatewayInfo: (info: GatewayInfo) => void
  setClient: (client: GatewayClient | null) => void
  handleEvent: (evt: GatewayEventFrame) => void

  /** Convenience: make an RPC call via the current client */
  rpc: <T = unknown>(method: string, params?: unknown) => Promise<T>
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  status: 'disconnected',
  gatewayVersion: null,
  gatewayInfo: null,
  client: null,
  lastEventSeq: null,

  setStatus: (status) => set({ status }),

  setGatewayInfo: (info) =>
    set({
      gatewayInfo: info,
      gatewayVersion: info.version ?? null,
    }),

  setClient: (client) => set({ client }),

  handleEvent: (evt) => {
    if (typeof evt.seq === 'number') {
      set({ lastEventSeq: evt.seq })
    }
    // Future tracks will dispatch events to thread/workspace stores here
    // For now, log non-tick events for debugging
    if (evt.event !== 'tick') {
      console.debug('[gateway event]', evt.event, evt.payload)
    }
  },

  rpc: async <T = unknown>(method: string, params?: unknown): Promise<T> => {
    const client = get().client
    if (!client) throw new Error('Gateway not connected')
    return client.request<T>(method, params)
  },
}))
```

### `kos/src/renderer/src/stores/workspace.ts`

Persisted workspace metadata — survives restarts.

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GatewaySnapshot } from '../gateway/types'

interface WorkspaceState {
  // From gateway snapshot.sessionDefaults
  agentId: string | null
  mainKey: string | null
  sessionKey: string | null

  // Gateway info
  uptimeMs: number | null
  configPath: string | null
  slashCommands: Array<{ name: string; description: string; category?: string }>

  // User preferences (future tracks will extend)
  theme: 'light' | 'dark' | 'system'

  // Actions
  setSnapshot: (snapshot: GatewaySnapshot) => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  reset: () => void
}

const initialState = {
  agentId: null as string | null,
  mainKey: null as string | null,
  sessionKey: null as string | null,
  uptimeMs: null as number | null,
  configPath: null as string | null,
  slashCommands: [] as Array<{ name: string; description: string; category?: string }>,
  theme: 'dark' as const,
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      ...initialState,

      setSnapshot: (snapshot) =>
        set({
          agentId: snapshot.sessionDefaults?.defaultAgentId ?? null,
          mainKey: snapshot.sessionDefaults?.mainKey ?? null,
          sessionKey: snapshot.sessionDefaults?.mainSessionKey ?? null,
          uptimeMs: snapshot.uptimeMs,
          configPath: snapshot.configPath ?? null,
          slashCommands: snapshot.slashCommands ?? [],
        }),

      setTheme: (theme) => set({ theme }),

      reset: () => set(initialState),
    }),
    {
      name: 'kos.workspace',
      // Only persist user preferences + session defaults, not transient snapshot data
      partialize: (state) => ({
        agentId: state.agentId,
        mainKey: state.mainKey,
        sessionKey: state.sessionKey,
        theme: state.theme,
      }),
    }
  )
)
```

### `kos/src/renderer/src/stores/threads.ts`

Persisted thread list — thread descriptors survive restarts, chat messages do NOT (fetched fresh from gateway).

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Thread descriptor — lightweight metadata for the thread list */
export interface ThreadDescriptor {
  id: string
  sessionKey: string
  label: string
  createdAt: number
  lastActivityAt: number
  parentSessionKey: string
}

/** Full thread state — chat messages, streaming state, etc. */
export interface ThreadState {
  descriptor: ThreadDescriptor
  chatMessages: unknown[]
  chatStream: string | null
  chatRunId: string | null
  chatSending: boolean
  chatMessage: string        // Draft message in input
  chatLoading: boolean
  unreadCount: number
}

interface ThreadsState {
  /** All known thread descriptors (persisted) */
  descriptors: ThreadDescriptor[]
  /** Active thread ID (persisted) */
  activeThreadId: string | null
  /** Full thread states keyed by ID (transient — NOT persisted) */
  threads: Record<string, ThreadState>

  // Actions
  addThread: (descriptor: ThreadDescriptor) => void
  removeThread: (id: string) => void
  setActiveThread: (id: string | null) => void
  updateDescriptor: (id: string, updates: Partial<ThreadDescriptor>) => void
  setThreadState: (id: string, state: ThreadState) => void
  updateThreadState: (id: string, updates: Partial<ThreadState>) => void
  reset: () => void
}

function createThreadState(descriptor: ThreadDescriptor): ThreadState {
  return {
    descriptor,
    chatMessages: [],
    chatStream: null,
    chatRunId: null,
    chatSending: false,
    chatMessage: '',
    chatLoading: false,
    unreadCount: 0,
  }
}

export const useThreadsStore = create<ThreadsState>()(
  persist(
    (set, get) => ({
      descriptors: [],
      activeThreadId: null,
      threads: {},

      addThread: (descriptor) =>
        set((state) => ({
          descriptors: [...state.descriptors, descriptor],
          threads: { ...state.threads, [descriptor.id]: createThreadState(descriptor) },
        })),

      removeThread: (id) =>
        set((state) => {
          const { [id]: _, ...rest } = state.threads
          return {
            descriptors: state.descriptors.filter((d) => d.id !== id),
            threads: rest,
            activeThreadId: state.activeThreadId === id ? null : state.activeThreadId,
          }
        }),

      setActiveThread: (id) => set({ activeThreadId: id }),

      updateDescriptor: (id, updates) =>
        set((state) => ({
          descriptors: state.descriptors.map((d) => (d.id === id ? { ...d, ...updates } : d)),
        })),

      setThreadState: (id, threadState) =>
        set((state) => ({
          threads: { ...state.threads, [id]: threadState },
        })),

      updateThreadState: (id, updates) =>
        set((state) => {
          const existing = state.threads[id]
          if (!existing) return state
          return {
            threads: { ...state.threads, [id]: { ...existing, ...updates } },
          }
        }),

      reset: () => set({ descriptors: [], activeThreadId: null, threads: {} }),
    }),
    {
      name: 'kos.threads',
      // Only persist descriptors and active selection — NOT full chat state
      partialize: (state) => ({
        descriptors: state.descriptors,
        activeThreadId: state.activeThreadId,
      }),
    }
  )
)
```

### `kos/src/renderer/src/stores/layout.ts`

Persisted layout state — pane arrangement, sidebar visibility, split ratios.

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface PaneState {
  paneId: string
  threadId: string
  scrollUserNearBottom: boolean
  sidebarOpen: boolean
  sidebarSplitRatio: number
}

interface LayoutState {
  /** Ordered list of pane IDs in the layout */
  paneOrder: string[]
  /** Pane states keyed by pane ID */
  panes: Record<string, PaneState>
  /** Whether the sidebar/thread list is collapsed */
  sidebarCollapsed: boolean

  // Actions
  addPane: (paneId: string, threadId: string) => void
  removePane: (paneId: string) => void
  updatePane: (paneId: string, updates: Partial<PaneState>) => void
  setPaneThread: (paneId: string, threadId: string) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  reset: () => void
}

function createPaneState(paneId: string, threadId: string): PaneState {
  return {
    paneId,
    threadId,
    scrollUserNearBottom: true,
    sidebarOpen: false,
    sidebarSplitRatio: 0.6,
  }
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      paneOrder: [],
      panes: {},
      sidebarCollapsed: false,

      addPane: (paneId, threadId) =>
        set((state) => ({
          paneOrder: [...state.paneOrder, paneId],
          panes: { ...state.panes, [paneId]: createPaneState(paneId, threadId) },
        })),

      removePane: (paneId) =>
        set((state) => {
          const { [paneId]: _, ...rest } = state.panes
          return {
            paneOrder: state.paneOrder.filter((id) => id !== paneId),
            panes: rest,
          }
        }),

      updatePane: (paneId, updates) =>
        set((state) => {
          const existing = state.panes[paneId]
          if (!existing) return state
          return {
            panes: { ...state.panes, [paneId]: { ...existing, ...updates } },
          }
        }),

      setPaneThread: (paneId, threadId) =>
        set((state) => {
          const existing = state.panes[paneId]
          if (!existing) return state
          return {
            panes: {
              ...state.panes,
              [paneId]: createPaneState(paneId, threadId),
            },
          }
        }),

      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      reset: () => set({ paneOrder: [], panes: {}, sidebarCollapsed: false }),
    }),
    {
      name: 'kos.layout',
      // Persist everything — layout should survive restarts
      partialize: (state) => ({
        paneOrder: state.paneOrder,
        panes: state.panes,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
)
```

---

## 10. Tailwind + shadcn/ui Setup

### Initialization Steps (must be run after `npm install`)

```bash
cd kos/

# Initialize shadcn/ui — this creates components.json, updates globals.css, creates lib/utils.ts
npx shadcn@latest init

# When prompted:
# - Style: Default
# - Base color: Zinc
# - CSS variables: Yes
# - tailwind.config location: tailwind.config.ts (or use v4 CSS-based config)
# - Components alias: @/components
# - Utils alias: @/lib/utils
# - React Server Components: No
# - Write to components.json: Yes

# Install a few starter components to verify the setup works
npx shadcn@latest add button
npx shadcn@latest add card
```

### `kos/postcss.config.js`

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

### `kos/tailwind.config.ts`

**Note:** If using Tailwind v4 with the `@tailwindcss/vite` plugin (as configured in `electron.vite.config.ts`), configuration is CSS-first and `tailwind.config.ts` may not be needed. The `@import 'tailwindcss'` in `globals.css` handles it. However, shadcn init may generate this file — keep whatever it generates.

```ts
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: ['./src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // shadcn adds its extensions here during init
    },
  },
  plugins: [],
}

export default config
```

---

## 11. Hot Reload Configuration

### Renderer (Vite HMR + React Fast Refresh)

**Already handled** by electron-vite + `@vitejs/plugin-react`. In dev mode:
- electron-vite starts the Vite dev server for the renderer
- Sets `process.env.ELECTRON_RENDERER_URL` for the main process
- React Fast Refresh is included in `@vitejs/plugin-react`
- Component edits hot-replace without full reload
- CSS changes apply instantly via Vite HMR

### Main Process (electron-vite watch + auto-restart)

**Already handled** by `electron-vite dev`. The `dev` command:
- Watches `src/main/` for changes
- Rebuilds and restarts the Electron main process automatically
- The renderer dev server stays running (no full restart)
- Window state is persisted to disk, so the window reappears at the same position/size after main process restart

**Important:** Window state persistence (Section 5) is critical for main process hot reload UX. Without it, every main process restart would reset window position.

---

## 12. Implementation Order

Execute these steps in order. Each step should produce a working (or at least buildable) state.

### Step 1: Initialize project

```bash
mkdir -p /Users/aneyman/bot/openclaw/kos
cd /Users/aneyman/bot/openclaw/kos
npm init -y
```

Write `package.json` (Section 2), all `tsconfig.*.json` files (Section 3), `electron.vite.config.ts` (Section 4), `postcss.config.js` (Section 10).

```bash
npm install
```

### Step 2: Main process + preload

Create `src/main/index.ts`, `src/main/window-state.ts`, `src/preload/index.ts`, `src/preload/index.d.ts` (Sections 5 + 6).

### Step 3: Renderer HTML + React root

Create `src/renderer/index.html`, `src/renderer/src/main.tsx`, `src/renderer/src/env.d.ts`, `src/renderer/src/globals.css` (Section 7).

### Step 4: shadcn/ui initialization

```bash
npx shadcn@latest init
npx shadcn@latest add button card
```

Create `src/renderer/src/lib/utils.ts` if shadcn didn't.

### Step 5: Zustand stores

Create all four store files (Section 9): `connection.ts`, `workspace.ts`, `threads.ts`, `layout.ts`.

### Step 6: Gateway client

Create `src/renderer/src/gateway/types.ts`, `auth.ts`, `client.ts`, `useGateway.ts` (Section 8).

### Step 7: App shell + pages

Create `src/renderer/src/App.tsx`, `src/renderer/src/pages/Home.tsx` (Section 7).

### Step 8: Verify

```bash
npm run dev     # Should open Electron window, connect to gateway, show connection status
npm run build   # Should produce out/ directory with built app
npm run typecheck  # Should pass with no errors
```

---

## 13. Validation Criteria

The scaffold is complete when:

1. **`npm run dev`** opens an Electron window showing the kOS home page
2. **Gateway connection** indicator shows green ("connected") when gateway is running on localhost:19001
3. **Gateway connection** indicator shows red ("disconnected") when gateway is not running, and automatically reconnects when it starts
4. **Window state** persists: close the app, reopen → same position, size, maximized state
5. **Hot reload** works: edit `Home.tsx` → change appears without restarting Electron
6. **Main process restart** works: edit `src/main/index.ts` → Electron restarts, window reappears at saved position
7. **Zustand persistence** works: set theme to "dark" in devtools → reload → theme persists
8. **TypeScript** compiles cleanly: `npm run typecheck` passes
9. **Build** succeeds: `npm run build` produces distributable output in `out/`
10. **shadcn/ui** components render correctly: `<Button>` and `<Card>` from shadcn work with proper Tailwind styling

---

## 14. Notes for Implementer

### Gateway protocol quirks

- **Connect flow:** Open WebSocket → wait up to 750ms for `connect.challenge` event (contains `nonce`) → send `connect` RPC. If no challenge arrives (older gateway), send `connect` after the timeout.
- **Sequence tracking:** Every event frame may have a `seq` field. Track `lastSeq` and report gaps via `onGap` callback. Gaps mean missed events — future tracks will handle this with snapshot refresh.
- **Auth flow:** Device identity (Ed25519 keypair) is generated once and stored in localStorage. On connect, sign a payload with the private key and send the signature. The gateway may issue a `deviceToken` in the hello-ok response — store it for future reconnects.

### Electron security

- **Never enable `nodeIntegration`** in the renderer. All Node.js access goes through the preload IPC bridge.
- **`contextIsolation: true`** is mandatory — the preload script's `contextBridge.exposeInMainWorld` is the only safe bridge.
- **CSP in HTML** restricts script/connect sources. Update if needed but keep it tight.

### Client ID registration

The `kos-desktop` client ID must be added to the gateway's `GATEWAY_CLIENT_IDS` constant in `/Users/aneyman/bot/openclaw/src/gateway/protocol/client-info.ts`:

```ts
export const GATEWAY_CLIENT_IDS = {
  // ... existing entries ...
  KOS_DESKTOP: "kos-desktop",
} as const;
```

This is required for the gateway to accept connections from kOS. Do this as part of implementation.

### What NOT to build in Track 1

- No chat UI (Track 2)
- No thread creation/management UI (Track 2)
- No file/artifact viewer (Track 3+)
- No settings panel (future track)
- No auto-updater (future track)
- No system tray icon (future track)
- No multi-window support (future track)

Track 1 is **scaffold only** — the minimum viable foundation that all other tracks build on.
