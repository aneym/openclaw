# Spec: Webchat Rich Tool Rendering

## Goal

Upgrade the webchat tool result UI from raw JSON dumps to rich, interactive renderers — starting with image previews, file downloads, and copy actions.

## Current State

- `webclaw/src/components/prompt-kit/tool.tsx` renders all tool results as collapsed JSON
- No image rendering anywhere in webchat
- No file serving endpoint — local paths can't be loaded by the browser
- `MEDIA:` lines in agent output are just text

## Deliverables

### 1. Gateway File Serving Endpoint

**File:** `src/gateway/server-file-serve.ts` (new) + register in gateway HTTP server

- `GET /api/files?path=<absolute-path>`
- Auth: Require gateway token via `Authorization: Bearer <token>` header or `?token=` query param
- Serve with correct MIME type (use existing `detectMime` from `src/media/mime.ts`)
- Security: Only serve files, not directories. Reject path traversal. Optional: allowlist to paths under home dir or tmp.
- Support common image types: png, jpg, jpeg, webp, gif, svg
- Also support: pdf, json, txt, md (for future use)
- Cache headers: `Cache-Control: private, max-age=3600`

### 2. Rich Tool Result Renderers

**File:** `webclaw/src/components/prompt-kit/tool.tsx` (extend) or `tool-renderers/` (new dir)

Create a renderer registry keyed by tool name. When a tool result matches a known renderer, use it instead of the default JSON view.

#### Image Renderer (for tools: `exec`, `Read`, `image`, `nano-banana-pro`)

Detect image content in tool results:

- Output contains `MEDIA:/path/to/file`
- Output contains file paths ending in `.png`, `.jpg`, `.webp`, `.gif`, `.svg`
- Tool is `Read` and input `path` ends in image extension
- Tool is `image` (always has image output)

Render:

- **Inline image preview** — thumbnail (max 400px wide) using `/api/files?path=...&token=...`
- **Click to expand** — lightbox/modal showing full-size image
- **Action bar below image:**
  - 📋 **Copy** — copy image to clipboard (`navigator.clipboard.write` with ClipboardItem)
  - 💾 **Download** — trigger browser download to Downloads folder
  - 📂 **Open in Finder** — (stretch) if we add a gateway RPC for `open` command
  - 🔗 **Copy path** — copy the file path to clipboard

#### Exec Renderer

- Show command in a styled code block header
- Show output in a scrollable, syntax-highlighted block
- Detect exit code from output, show green check / red X
- If output contains `MEDIA:` lines, extract and render images inline above the text output

#### Default Renderer (current behavior)

- Keep current JSON collapsible as fallback for unrecognized tools

### 3. MEDIA: Line Detection in Message Text

**File:** `webclaw/src/screens/chat/components/message-item.tsx` or new utility

When rendering assistant message text:

- Scan for `MEDIA:/path/to/file` lines
- Replace with inline `<img>` tags pointing to `/api/files?path=...`
- Style consistently with tool image renderer

### 4. Webchat Auth Token Access

The webchat client needs the gateway token to authenticate file requests.

- It already has the token for WebSocket auth — expose it for HTTP requests too
- Add a hook or utility: `useFileUrl(path: string) => string` that constructs the full URL with auth

## File Structure

```
webclaw/src/components/prompt-kit/
  tool.tsx                    — existing, add renderer dispatch
  tool-renderers/
    index.ts                  — registry + dispatcher
    image-renderer.tsx        — image preview + actions
    exec-renderer.tsx         — command + output + media extraction
    default-renderer.tsx      — current JSON view, extracted
  image-lightbox.tsx          — modal for full-size image viewing
```

## Non-Goals (for now)

- Audio/video playback in tool results
- Drag-and-drop from tool results
- Tool result editing/re-running

## Testing

- Generate an image with nano-banana-pro → should show inline in tool result
- `Read` an image file → should show inline
- `exec` that outputs `MEDIA:` → should show image
- Non-image tools → should fall back to JSON view
- Auth: unauthenticated `/api/files` requests should 401
