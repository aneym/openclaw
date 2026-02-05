# kOS Remote Access Specification

## Overview

Enable kOS to function as a complete remote dev environment by connecting to a gateway running on another machine. Primary use case: Mac Studio at work runs OpenClaw 24/7, MacBook at home runs kOS UI and connects to Studio via Tailscale.

**Linear:** KOS-34 (parent), KOS-30, KOS-31, KOS-32, KOS-33

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Mac Studio @ Work (always-on)                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  OpenClaw Gateway (port 18789)                          │    │
│  │  • Agent sessions, chat, tools                          │    │
│  │  • Terminal PTY sessions (terminal-pty.ts)              │    │
│  │  • File read/write/list APIs                            │    │
│  │  • Browser automation                                   │    │
│  │  • All repos, all tools                                 │    │
│  └─────────────────────────────────────────────────────────┘    │
│                         ↑                                       │
│                    Tailscale (100.x.x.x)                        │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│  MacBook @ Home                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  kOS Electron                                           │    │
│  │  • Connects to Studio gateway via Tailscale             │    │
│  │  • Terminal panel → gateway PTY WebSocket               │    │
│  │  • File explorer → gateway file APIs                    │    │
│  │  • Chat, browser, panels all work remotely              │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## KOS-30: Remote Gateway Connection Mode

### Current State

- `gateway-store.ts` has `connect(url, token, source)` — already supports any URL
- `ConnectionSettings.tsx` shows status but auto-detects local config
- Gateway URL comes from `~/.openclaw/openclaw.json` or `~/.openclaw-dev/`

### Implementation

#### 1. Connection Profiles Store

```typescript
// stores/connection-store.ts
interface ConnectionProfile {
  id: string;
  name: string; // "Work Studio", "Home", "Dev"
  gatewayUrl: string; // "ws://100.64.0.5:18789" or "ws://localhost:18789"
  token?: string; // auth token (stored securely)
  isDefault: boolean;
  lastConnected?: number;
}

interface ConnectionStore {
  profiles: ConnectionProfile[];
  activeProfileId: string | null;

  addProfile: (profile: Omit<ConnectionProfile, "id">) => void;
  updateProfile: (id: string, updates: Partial<ConnectionProfile>) => void;
  removeProfile: (id: string) => void;
  setActiveProfile: (id: string) => void;
  getActiveProfile: () => ConnectionProfile | undefined;
}
```

#### 2. Connection Settings UI

Update `ConnectionSettings.tsx`:

```tsx
// Add profile management
<div className="space-y-4">
  <h3>Gateway Profiles</h3>

  {profiles.map(profile => (
    <div key={profile.id} className="flex items-center gap-2">
      <RadioButton
        checked={profile.id === activeProfileId}
        onChange={() => switchProfile(profile.id)}
      />
      <span>{profile.name}</span>
      <span className="text-muted-foreground text-xs">{profile.gatewayUrl}</span>
      <Button variant="ghost" size="sm" onClick={() => editProfile(profile)}>Edit</Button>
    </div>
  ))}

  <Button onClick={addNewProfile}>+ Add Profile</Button>
</div>

// Profile dialog
<Dialog>
  <Input label="Name" value={name} onChange={setName} />
  <Input label="Gateway URL" value={url} onChange={setUrl} placeholder="ws://100.64.0.5:18789" />
  <Input label="Token" type="password" value={token} onChange={setToken} />
  <Button onClick={testConnection}>Test Connection</Button>
</Dialog>
```

#### 3. Quick Profile Switcher

Add to StatusBar or CommandPalette:

- Show current profile name
- Cmd+Shift+G → profile picker
- Quick switch without opening settings

### Acceptance Criteria

- [ ] Can add/edit/remove gateway profiles
- [ ] Can switch between profiles (reconnects gateway)
- [ ] Active profile persists across app restarts
- [ ] "Test Connection" validates URL before saving
- [ ] Token stored securely (Electron safeStorage)

---

## KOS-31: Remote Terminal via Gateway WebSocket

### Current State

- `TerminalPanel.tsx` uses `window.api.terminal.*` (Electron IPC → local node-pty)
- Gateway has `terminal-pty.ts` with PTY sessions and WebSocket attachment
- Gateway has `terminal-http.ts` with REST endpoints for create/list/kill

### Implementation

#### 1. Gateway Terminal WebSocket Endpoint

Gateway already has the PTY infrastructure. Need to expose WebSocket endpoint:

```typescript
// In gateway server-http.ts, add WebSocket upgrade handler
if (url.pathname === "/api/terminals/ws") {
  // Upgrade to WebSocket
  // Route: /api/terminals/ws?id=<terminal-id>
  const terminalId = url.searchParams.get("id");
  if (!terminalId) return sendError(400);

  // Attach WebSocket to existing terminal session
  attachWebSocket(terminalId, ws);
}
```

The `attachWebSocket` function already exists in `terminal-pty.ts`.

#### 2. Terminal Panel Remote Mode

```typescript
// components/panels/TerminalPanel.tsx
interface TerminalPanelProps {
  mode: "local" | "remote"; // new prop
  terminalId?: string;
  cwd?: string;
}

export function TerminalPanel({ mode = "local", cwd }: TerminalPanelProps) {
  // ... existing xterm setup ...

  const initTerminal = useCallback(async () => {
    // ... xterm init ...

    if (mode === "local") {
      // Current behavior: use Electron IPC
      const result = await window.api.terminal.create(cwd, cols, rows);
      terminalIdRef.current = result.id;

      // Forward input via IPC
      terminal.onData((data) => {
        window.api.terminal.write(terminalIdRef.current, data);
      });
    } else {
      // Remote mode: use gateway WebSocket
      const { gatewayUrl, token } = useConnectionStore.getState().getActiveProfile();

      // Create terminal via HTTP
      const res = await fetch(`${httpUrl}/api/terminals`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cwd }),
      });
      const { id } = await res.json();
      terminalIdRef.current = id;

      // Connect WebSocket
      const wsUrl = `${gatewayUrl}/api/terminals/ws?id=${id}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (e) => {
        if (e.data instanceof Blob) {
          e.data.text().then((text) => terminal.write(text));
        } else {
          terminal.write(e.data);
        }
      };

      // Forward input via WebSocket
      terminal.onData((data) => {
        ws.send(data);
      });
    }
  }, [mode, cwd]);

  // ... rest of component ...
}
```

#### 3. Auto-Detect Mode

```typescript
// Determine mode based on active connection profile
const connectionProfile = useConnectionStore(s => s.getActiveProfile());
const isRemote = connectionProfile && !connectionProfile.gatewayUrl.includes('localhost');

<TerminalPanel mode={isRemote ? 'remote' : 'local'} cwd={workspace.path} />
```

### Acceptance Criteria

- [ ] TerminalPanel works with local node-pty (existing behavior)
- [ ] TerminalPanel works with remote gateway WebSocket
- [ ] Auto-detects mode based on connection profile
- [ ] Resize events sent to remote terminal
- [ ] Handles disconnect/reconnect gracefully
- [ ] Shell environment matches remote machine

---

## KOS-32: Gateway Directory Listing API

### Current State

- `/api/file/read` — read file contents
- `/api/file/write` — write file contents
- No directory listing

### Implementation

Add to `file-http.ts`:

```typescript
const LIST_PREFIX = "/api/file/list";

// GET /api/file/list?path=/Users/alex/repos
if (url.pathname === LIST_PREFIX && req.method === "GET") {
  const rawPath = url.searchParams.get("path") ?? "~";
  const dirPath = resolvePath(rawPath);

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const items = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dirPath, entry.name);
        const stat = await fs.stat(fullPath).catch(() => null);

        return {
          name: entry.name,
          path: fullPath,
          isDirectory: entry.isDirectory(),
          isFile: entry.isFile(),
          size: stat?.size ?? 0,
          mtime: stat?.mtimeMs ?? 0,
        };
      }),
    );

    sendJson(res, 200, {
      path: dirPath,
      items: items.sort((a, b) => {
        // Directories first, then alphabetical
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    });
  } catch (err) {
    sendJson(res, 404, { error: "Directory not found" });
  }
  return true;
}
```

### Acceptance Criteria

- [ ] `GET /api/file/list?path=~` returns home directory contents
- [ ] Response includes name, path, isDirectory, isFile, size, mtime
- [ ] Directories sorted before files
- [ ] Auth required (same as read/write)
- [ ] Handles permission errors gracefully

---

## KOS-33: File Explorer Panel

### Implementation

#### 1. Panel Type

```typescript
// types/panel.ts
export type PanelType =
  | "chat"
  | "terminal"
  | "browser"
  | "preview"
  | "coding-session"
  | "tasks"
  | "files" // NEW
  | "empty";

export interface FilesPanelConfig {
  type: "files";
  rootPath: string;
  expandedPaths: string[];
}
```

#### 2. File Explorer Component

```tsx
// components/panels/FilesPanel.tsx
export function FilesPanel({ rootPath }: { rootPath: string }) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);

  // Fetch directory contents
  const fetchDir = async (path: string) => {
    const { gatewayUrl, token } = useConnectionStore.getState().getActiveProfile();
    const res = await fetch(`${httpUrl}/api/file/list?path=${encodeURIComponent(path)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  };

  // Load root on mount
  useEffect(() => {
    fetchDir(rootPath).then((data) => setTree(data.items));
  }, [rootPath]);

  // Expand directory
  const toggleExpand = async (path: string) => {
    if (expanded.has(path)) {
      setExpanded((prev) => {
        prev.delete(path);
        return new Set(prev);
      });
    } else {
      const data = await fetchDir(path);
      // Merge into tree...
      setExpanded((prev) => new Set([...prev, path]));
    }
  };

  // Render tree
  return (
    <div className="h-full overflow-auto p-2">
      <FileTree
        items={tree}
        expanded={expanded}
        selected={selected}
        onToggle={toggleExpand}
        onSelect={setSelected}
        onDoubleClick={(item) => {
          if (item.isFile) {
            // Open in editor or preview
          }
        }}
      />
    </div>
  );
}
```

#### 3. File Tree Component

```tsx
function FileTree({ items, expanded, selected, onToggle, onSelect, onDoubleClick, depth = 0 }) {
  return (
    <div style={{ paddingLeft: depth * 16 }}>
      {items.map((item) => (
        <div key={item.path}>
          <div
            className={cn(
              "flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-accent",
              selected === item.path && "bg-accent",
            )}
            onClick={() => onSelect(item.path)}
            onDoubleClick={() => onDoubleClick(item)}
          >
            {item.isDirectory ? (
              <ChevronRight
                className={cn(
                  "h-4 w-4 transition-transform",
                  expanded.has(item.path) && "rotate-90",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(item.path);
                }}
              />
            ) : (
              <File className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-sm truncate">{item.name}</span>
          </div>

          {item.isDirectory && expanded.has(item.path) && item.children && (
            <FileTree
              items={item.children}
              expanded={expanded}
              selected={selected}
              onToggle={onToggle}
              onSelect={onSelect}
              onDoubleClick={onDoubleClick}
              depth={depth + 1}
            />
          )}
        </div>
      ))}
    </div>
  );
}
```

### Acceptance Criteria

- [ ] Tree view of remote filesystem
- [ ] Expand/collapse directories
- [ ] File icons based on extension
- [ ] Double-click file opens preview
- [ ] Right-click context menu (create, rename, delete)
- [ ] Integrates with panel system (can be split/resized)

---

## Implementation Order

1. **KOS-30: Remote Gateway Connection** — Foundation. Without this, nothing else works remotely.
2. **KOS-31: Remote Terminal** — Highest value. Shell access is core to dev workflow.
3. **KOS-32: Directory Listing API** — Gateway-side prereq for file explorer.
4. **KOS-33: File Explorer Panel** — Nice to have, lower priority.

Estimate: 2-3 days for KOS-30 + KOS-31 (the critical path).

---

## Security Notes

- Tailscale handles network-level security (no port forwarding needed)
- Gateway token required for all API calls
- Tokens should be stored in Electron safeStorage
- Consider device auth (public key signing) for additional security
- Rate limiting on terminal/file APIs to prevent abuse

---

## Testing

1. **Local mode** — All existing functionality works with localhost gateway
2. **Remote mode** — Connect to another machine's gateway via Tailscale IP
3. **Profile switching** — Seamlessly switch between local and remote
4. **Reconnection** — Handles network interruptions gracefully
5. **Terminal persistence** — Terminal session survives brief disconnects

---

## Future Enhancements

- **Tailscale auto-discovery** — Detect other machines running OpenClaw on Tailscale network
- **SSH key auth** — Use SSH keys instead of/in addition to tokens
- **Collaborative mode** — Multiple kOS clients connected to same gateway
- **Offline mode** — Queue messages when disconnected, sync when reconnected
