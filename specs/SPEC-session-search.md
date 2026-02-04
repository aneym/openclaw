# SPEC: End-to-End Session Search for WebUI

## Overview

Implement proper semantic text search for historical chat sessions in the webchat UI, ordered by recency and relevancy. Replace the current client-side substring matching with server-side search backed by SQLite FTS and vector embeddings.

## Current State

### Backend

- Sessions stored in `sessions.store.json` (metadata only)
- Session transcripts stored as JSONL files (via `SessionManager`)
- `sessions.list` has a `search` param that only does substring matching on displayName/label/subject/sessionId/key
- Memory search infrastructure exists (`MemoryIndexManager`) using:
  - SQLite FTS5 for keyword search
  - `sqlite-vec` for vector similarity search
  - Hybrid ranking combining both

### Frontend

- `ui/src/ui/views/thread-list.ts` has `threadSearchQuery` and `matchesThreadSearch()`
- Only searches session names/labels/keys client-side
- No content search of actual messages

## Requirements

1. **Search session message content**, not just metadata
2. **Hybrid ranking**: Combine text relevance (BM25/FTS) with recency
3. **Return snippets**: Show matching text excerpts with highlighting
4. **Fast**: Index once, query fast. Incremental updates on new messages.
5. **Order by**: Primary = relevance, secondary = recency

## Implementation Plan

### Phase 1: Backend - Session Search Index

#### 1.1 New file: `src/gateway/session-search.ts`

Create a dedicated session search manager that:

- Reuses the embedding infrastructure from `src/memory/`
- Indexes session transcripts into a dedicated SQLite DB
- Provides search with snippets

```typescript
export interface SessionSearchResult {
  sessionKey: string;
  sessionId: string;
  score: number; // Combined relevance + recency score
  matchCount: number; // Number of matching chunks
  snippet: string; // Highlighted excerpt from best match
  snippetRole: "user" | "assistant";
  updatedAt: number | null;
  derivedTitle?: string;
}

export interface SessionSearchParams {
  query: string;
  limit?: number; // Default 20
  minScore?: number; // Default 0.1
  agentId?: string; // Filter by agent
  includeArchived?: boolean;
}

export class SessionSearchManager {
  static async get(params: { cfg: OpenClawConfig; agentId: string }): Promise<SessionSearchManager>;

  async search(params: SessionSearchParams): Promise<SessionSearchResult[]>;
  async indexSession(sessionKey: string, sessionId: string): Promise<void>;
  async removeSession(sessionKey: string): Promise<void>;
  async sync(opts?: { force?: boolean }): Promise<void>;
  async close(): Promise<void>;
}
```

#### 1.2 Index Schema

Separate SQLite DB at `~/.openclaw/state/agents/{agentId}/session-search.db`:

```sql
-- Session metadata
CREATE TABLE sessions (
  session_key TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  updated_at INTEGER,
  indexed_at INTEGER,
  chunk_count INTEGER DEFAULT 0
);

-- Message chunks for search
CREATE TABLE chunks (
  id INTEGER PRIMARY KEY,
  session_key TEXT NOT NULL,
  role TEXT NOT NULL,           -- 'user' | 'assistant'
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  created_at INTEGER,
  FOREIGN KEY (session_key) REFERENCES sessions(session_key) ON DELETE CASCADE
);

-- FTS5 index
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  content,
  content='chunks',
  content_rowid='id'
);

-- Vector index (sqlite-vec)
CREATE VIRTUAL TABLE chunks_vec USING vec0(
  id INTEGER PRIMARY KEY,
  embedding FLOAT[1536]  -- or 768 for smaller models
);

-- Triggers to keep FTS in sync
CREATE TRIGGER chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
END;
CREATE TRIGGER chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES('delete', old.id, old.content);
END;
```

#### 1.3 Indexing Strategy

1. On startup/sync: Scan all session transcripts, index any new/modified
2. On transcript update: Listen to `onSessionTranscriptUpdate()` event, re-index that session
3. Chunking: Split messages into ~500 token chunks with 50 token overlap
4. Skip tool calls and system messages (only index user + assistant content)

#### 1.4 Search Algorithm

```typescript
async search(params: SessionSearchParams): Promise<SessionSearchResult[]> {
  const { query, limit = 20, minScore = 0.1 } = params;

  // 1. FTS search for keyword matches
  const ftsResults = await this.searchFts(query, limit * 3);

  // 2. Vector search for semantic matches (if embeddings available)
  const vecResults = this.vector.available
    ? await this.searchVector(query, limit * 3)
    : [];

  // 3. Hybrid merge with RRF (Reciprocal Rank Fusion)
  const merged = mergeHybridResults(ftsResults, vecResults, {
    ftsWeight: 0.4,
    vecWeight: 0.6,
  });

  // 4. Apply recency boost: score *= 1 + recencyBoost(updatedAt)
  const boosted = merged.map(r => ({
    ...r,
    score: r.score * (1 + recencyBoost(r.updatedAt)),
  }));

  // 5. Dedupe by session, keep best match per session
  const bySession = groupBySession(boosted);

  // 6. Sort by score, apply limit, filter by minScore
  return bySession
    .filter(r => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function recencyBoost(updatedAt: number | null): number {
  if (!updatedAt) return 0;
  const ageMs = Date.now() - updatedAt;
  const ageHours = ageMs / (1000 * 60 * 60);
  // Decay: 0.5 boost for recent, decaying to 0 over 30 days
  return Math.max(0, 0.5 * Math.exp(-ageHours / 720));
}
```

### Phase 2: RPC Endpoint

#### 2.1 Add protocol schema: `src/gateway/protocol/schema/sessions.ts`

```typescript
export const SessionsSearchParamsSchema = Type.Object(
  {
    query: NonEmptyString,
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    minScore: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
    agentId: Type.Optional(NonEmptyString),
    includeArchived: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

export const SessionsSearchResultSchema = Type.Object({
  sessionKey: Type.String(),
  sessionId: Type.String(),
  score: Type.Number(),
  matchCount: Type.Integer(),
  snippet: Type.String(),
  snippetRole: Type.Union([Type.Literal("user"), Type.Literal("assistant")]),
  updatedAt: Type.Union([Type.Integer(), Type.Null()]),
  derivedTitle: Type.Optional(Type.String()),
});
```

#### 2.2 Register RPC method in `src/gateway/protocol/index.ts`

Add `sessions.search` to the RPC router, handled by a new handler.

#### 2.3 Implement handler: `src/gateway/server-session-search.ts`

```typescript
export async function handleSessionsSearch(
  params: SessionsSearchParams,
  ctx: { cfg: OpenClawConfig },
): Promise<{ results: SessionSearchResult[] }> {
  const agentId = params.agentId ?? resolveDefaultAgentId(ctx.cfg);
  const manager = await SessionSearchManager.get({ cfg: ctx.cfg, agentId });
  const results = await manager.search(params);
  return { results };
}
```

### Phase 3: Frontend Integration

#### 3.1 Update `ui/src/ui/views/thread-list.ts`

1. When search query is non-empty and > 2 chars, debounce and call `sessions.search` RPC
2. Show search results with snippets below the search input
3. Clicking a result opens that session
4. Highlight the snippet text matching the query

```typescript
// Module-level state
let searchResults: SessionSearchResult[] = [];
let searchLoading = false;
let searchError: string | null = null;

// Debounced search function
const debouncedSearch = debounce(async (query: string, gateway: GatewayClient) => {
  if (query.length < 3) {
    searchResults = [];
    return;
  }
  searchLoading = true;
  try {
    const response = await gateway.request("sessions.search", { query, limit: 20 });
    searchResults = response.results;
    searchError = null;
  } catch (err) {
    searchError = err.message;
  } finally {
    searchLoading = false;
  }
}, 300);
```

#### 3.2 Search Results UI

When search results are present, show them instead of the grouped session list:

```typescript
${searchResults.length > 0 ? html`
  <div class="nav-threads__search-results">
    ${searchResults.map(result => html`
      <button
        class="nav-thread-item nav-thread-item--search-result"
        @click=${() => onSelect(result.sessionKey)}
        title="${result.derivedTitle ?? result.sessionKey}"
      >
        <div class="nav-thread-item__content">
          <span class="nav-thread-item__label">${result.derivedTitle ?? humanizeSessionKey(result.sessionKey)}</span>
          <span class="nav-thread-item__snippet">${highlightSnippet(result.snippet, threadSearchQuery)}</span>
        </div>
        <span class="nav-thread-item__score">${Math.round(result.score * 100)}%</span>
        ${result.updatedAt ? html`<span class="nav-thread-item__time">${compactAgo(result.updatedAt)}</span>` : nothing}
      </button>
    `)}
  </div>
` : /* existing group list */ }
```

#### 3.3 Styling

Add CSS for search results in `ui/src/styles/`:

```css
.nav-thread-item--search-result {
  border-left: 2px solid var(--accent-color);
}

.nav-thread-item__snippet {
  font-size: 0.75rem;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.nav-thread-item__snippet mark {
  background: var(--highlight-color);
  color: inherit;
  border-radius: 2px;
  padding: 0 2px;
}

.nav-thread-item__score {
  font-size: 0.65rem;
  color: var(--text-muted);
  opacity: 0.7;
}
```

### Phase 4: Background Sync

#### 4.1 Startup sync

In gateway startup (`src/gateway/boot.ts`), trigger background index sync:

```typescript
// After gateway is ready
const searchManager = await SessionSearchManager.get({ cfg, agentId: defaultAgentId });
searchManager.sync().catch((err) => log.warn("session search sync failed:", err));
```

#### 4.2 Live updates

Subscribe to transcript updates to keep index fresh:

```typescript
onSessionTranscriptUpdate((sessionFile) => {
  const sessionId = path.basename(sessionFile, ".jsonl");
  // Find session key from store, then re-index
  searchManager.indexSession(sessionKey, sessionId).catch(() => {});
});
```

## File Changes Summary

### New Files

- `src/gateway/session-search.ts` - SessionSearchManager class
- `src/gateway/server-session-search.ts` - RPC handler

### Modified Files

- `src/gateway/protocol/schema/sessions.ts` - Add SessionsSearchParams/Result schemas
- `src/gateway/protocol/index.ts` - Export new schemas, register RPC method
- `src/gateway/server.impl.ts` - Wire up sessions.search handler
- `src/gateway/boot.ts` - Initialize search index on startup
- `ui/src/ui/views/thread-list.ts` - Add search results display
- `ui/src/ui/gateway.ts` - Add sessions.search client method (if not using generic request)
- `ui/src/styles/nav.css` (or equivalent) - Search result styling

## Testing

1. **Unit tests**: `src/gateway/session-search.test.ts`
   - Index creation and schema
   - Chunking logic
   - FTS search accuracy
   - Vector search (mock embeddings)
   - Hybrid merge scoring
   - Recency boost

2. **Integration tests**:
   - Index multiple sessions, search, verify results
   - Delete session, verify removed from index
   - Incremental update on new message

3. **UI tests**:
   - Search input debouncing
   - Results display and click navigation
   - Empty state / no results state

## Performance Considerations

- **Index size**: ~50KB per 100 messages (FTS) + ~4KB per chunk (vectors)
- **Search latency**: Target <100ms for FTS, <300ms for hybrid
- **Embedding cost**: Only generate embeddings for new/changed content
- **Memory**: SQLite handles large indexes efficiently, keep DB connection pooled

## Future Enhancements (Out of Scope)

- Cross-session search (search all agents at once)
- Search filters (date range, channel, role)
- Search within a single session (Cmd+F equivalent)
- Export search results
