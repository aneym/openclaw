# Session Search Implementation Progress

## Overview

Implementing end-to-end semantic session search for the webchat UI based on `specs/SPEC-session-search.md`.

## Phase 1: Backend SessionSearchManager (COMPLETE)

### Goals

- Create `src/gateway/session-search.ts` with `SessionSearchManager` class
- Reuse embedding infrastructure from `src/memory/`
- Create separate SQLite DB for session search index at `~/.openclaw/agents/{agentId}/session-search.db`
- Index session transcripts (user + assistant messages only)
- Implement hybrid FTS + vector search with recency boost

### Implementation

Created `src/gateway/session-search.ts` with:

1. **SessionSearchManager class** - Singleton per agentId
   - Opens SQLite DB at `~/.openclaw/agents/{agentId}/session-search.db`
   - Creates schema: `sessions`, `chunks`, `chunks_fts` (FTS5) tables

2. **Indexing**
   - `indexSession(sessionKey, sessionId)` - Parses JSONL transcript, extracts user/assistant messages
   - `removeSession(sessionKey)` - Removes session from index
   - `sync()` - Full index sync on startup, incremental on transcript updates

3. **Search**
   - FTS5-based keyword search with `buildFtsQuery()` from memory module
   - BM25 ranking via `bm25RankToScore()` from memory module
   - Recency boost: `0.5 * exp(-ageHours / 720)` (30-day decay)
   - Groups results by session, returns best match per session

4. **Live Updates**
   - Subscribes to `onSessionTranscriptUpdate()` events
   - Debounced sync (5s) on transcript changes

### Files Created/Modified

- [x] `src/gateway/session-search.ts` - SessionSearchManager class

### Decision: FTS-only for Phase 1

- Vector embeddings can be added later for semantic search
- FTS + recency boost provides good results for exact/partial matches
- Simpler implementation, no external API dependencies

---

## Phase 2: RPC Endpoint (COMPLETE)

### Goals

- Add `SessionsSearchParams` and `SessionsSearchResult` schemas
- Register `sessions.search` RPC method
- Implement handler in `src/gateway/server-methods/sessions.ts`

### Implementation

1. **Protocol Schema** (`src/gateway/protocol/schema/sessions.ts`)
   - Added `SessionsSearchParamsSchema` - query, limit, minScore, agentId, includeArchived
   - Added `SessionsSearchResultSchema` - sessionKey, sessionId, score, matchCount, snippet, snippetRole, updatedAt, derivedTitle

2. **Type Definitions** (`src/gateway/protocol/schema/types.ts`)
   - Added `SessionsSearchParams` and `SessionsSearchResult` types via `Static<typeof Schema>`

3. **Protocol Index** (`src/gateway/protocol/index.ts`)
   - Added validator `validateSessionsSearchParams`
   - Exported schemas and types

4. **Handler** (`src/gateway/server-methods/sessions.ts`)
   - Added `sessions.search` handler
   - Validates params, calls SessionSearchManager.search()
   - Returns results with error handling

### Files Modified

- [x] `src/gateway/protocol/schema/sessions.ts` - Added search schemas
- [x] `src/gateway/protocol/schema/types.ts` - Added search types
- [x] `src/gateway/protocol/index.ts` - Added validator and exports
- [x] `src/gateway/server-methods/sessions.ts` - Added handler

---

## Phase 3: Frontend Integration (COMPLETE)

### Goals

- Update `ui/src/ui/views/thread-list.ts`
- Debounced search with gateway RPC
- Show search results with snippets
- Highlight matching text

### Implementation

1. **Module-level State** (`ui/src/ui/views/thread-list.ts`)
   - Added `searchResults`, `searchLoading`, `searchError` state variables
   - Added `searchDebounceTimer` for debouncing

2. **Debounced Search Function**
   - `debouncedSearch()` - calls `sessions.search` RPC when query >= 3 chars
   - 300ms debounce to avoid excessive API calls
   - Clears results when query < 3 chars

3. **Props Update** (`NavThreadListProps`)
   - Added optional `gateway` prop for server-side search

4. **Rendering Updates**
   - Uses `hasServerSearch` flag when results are available
   - Filters sessions based on search results (matching by sessionKey or sessionId)
   - Shows loading indicator with `nav-threads__search-loading`
   - Shows error message with `nav-threads__search-error`
   - Shows snippet with role icon in `nav-thread-item__snippet`

5. **CSS Styles** (`ui/src/styles/chat/threads.css`)
   - Added `.nav-threads__search-loading` with pulsing animation
   - Added `.nav-threads__search-error` for error display
   - Added `.nav-thread-item__snippet` for search result snippets

6. **App Integration** (`ui/src/ui/app-render.ts`)
   - Passed `gateway: state.client` to `renderNavThreadList()`

### Files Modified

- [x] `ui/src/ui/views/thread-list.ts` - Search state, debounced search, snippet rendering
- [x] `ui/src/ui/app-render.ts` - Pass gateway client to thread list
- [x] `ui/src/styles/chat/threads.css` - Search UI styles

---

## Phase 4: Background Sync (COMPLETE - via Phase 1)

### Goals

- Trigger sync on gateway startup
- Subscribe to transcript updates for live index refresh

### Implementation

Already implemented in Phase 1 within `SessionSearchManager`:

1. **Startup Sync**
   - `getSessionSearchManager()` creates singleton and calls `sync()` on first access
   - Gateway startup triggers sync when handler first receives a search request

2. **Live Updates**
   - `SessionSearchManager.constructor()` subscribes to `onSessionTranscriptUpdate()` events
   - Debounced reindex (5s) when transcripts change
   - Updates index incrementally for changed sessions

---

## Errors & Resolutions

1. **ErrorCodes.INTERNAL doesn't exist**
   - Resolution: Changed to `ErrorCodes.UNAVAILABLE` (available codes: NOT_LINKED, NOT_PAIRED, AGENT_TIMEOUT, INVALID_REQUEST, UNAVAILABLE)

---

## Commits

- Phase 1: SessionSearchManager implementation
- Phase 2: RPC endpoint (`sessions.search`)
- Phase 3: Frontend integration (this commit)
