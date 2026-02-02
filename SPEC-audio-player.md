# SPEC: Audio Player in Web UI

## Problem

Voice messages from Telegram (and other channels) arrive with raw binary in `<file>` tags, rendering as garbled text in the webchat UI. We need to render an audio player instead.

## Current Flow

1. Voice message arrives from Telegram as `.ogg` (opus)
2. OpenClaw downloads it to `~/.openclaw/media/inbound/file_N---UUID.ogg`
3. It gets transcribed via OpenAI Whisper API (transcript shown as text)
4. The message content includes `<file name="..." mime="...">BINARY</file>` — this binary renders as garbled characters in the webchat

## Requirements

### 1. Gateway: Media Serving Endpoint

- Add `GET /api/media/:filename` endpoint to the gateway HTTP server
- Serve files from `~/.openclaw/media/inbound/` (and optionally `outbound/`)
- Set correct `Content-Type` headers (detect from file extension or stored mime)
- Only serve files that exist in the media directory (no path traversal)
- Should respect gateway auth (use existing auth token)

### 2. UI: Audio Player Rendering

In `ui/src/ui/chat/grouped-render.ts`:

- Detect when message text contains `<file name="..." mime="audio/...">` or `<media:audio>` patterns
- Strip the raw binary `<file>...</file>` block from the rendered text
- Insert an HTML `<audio>` element with controls pointing to `/api/media/FILENAME`
- Keep the transcript text visible (it appears before the `<file>` tag)
- Style the audio player to fit the chat bubble aesthetic

### 3. Message Text Cleanup

The message text currently looks like:

```
<media:audio> Transcript: Some text here <file name="file_0---UUID.ogg" mime="text/plain"> RAW_BINARY </file>
```

After rendering it should show:

- 🎤 Audio player (playable)
- "Some text here" (the transcript, as regular text)
- No raw binary

## Technical Notes

- Gateway HTTP routes: see `src/gateway/dev-rpc-http.ts` and `src/gateway/title-http.ts` for pattern
- UI message rendering: `ui/src/ui/chat/grouped-render.ts` — `renderGroupedMessage()` function
- Images already handled via `extractImages()` — follow same pattern for audio
- Audio files are opus in ogg container — browsers support this natively with `<audio>` tag
- Media directory: resolve via `~/.openclaw/media/inbound/`

## Out of Scope

- Video playback
- Audio recording in webchat
- Outbound audio from bot
