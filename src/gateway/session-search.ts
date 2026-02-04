/**
 * Session Search Manager
 *
 * Provides semantic search across session transcripts using hybrid FTS + vector search.
 * Indexes user and assistant messages for fast retrieval with recency boost.
 */
import type { DatabaseSync } from "node:sqlite";
import fs from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import { resolveAgentDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { loadSessionStore, resolveStorePath } from "../config/sessions.js";
import { resolveSessionTranscriptsDirForAgent } from "../config/sessions/paths.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { bm25RankToScore, buildFtsQuery } from "../memory/hybrid.js";
import { ensureDir } from "../memory/internal.js";
import { requireNodeSqlite } from "../memory/sqlite.js";
import { onSessionTranscriptUpdate } from "../sessions/transcript-events.js";

const log = createSubsystemLogger("session-search");

const INDEX_CACHE = new Map<string, SessionSearchManager>();
const SNIPPET_MAX_CHARS = 200;
const SYNC_DEBOUNCE_MS = 5000;
const FTS_TABLE = "chunks_fts";

export interface SessionSearchResult {
  sessionKey: string;
  sessionId: string;
  score: number;
  matchCount: number;
  snippet: string;
  snippetRole: "user" | "assistant";
  updatedAt: number | null;
  derivedTitle?: string;
}

export interface SessionSearchParams {
  query: string;
  limit?: number;
  minScore?: number;
  agentId?: string;
  includeArchived?: boolean;
}

type SessionRow = {
  session_key: string;
  session_id: string;
  updated_at: number | null;
  indexed_at: number | null;
  chunk_count: number;
};

export class SessionSearchManager {
  private readonly cacheKey: string;
  private readonly cfg: OpenClawConfig;
  private readonly agentId: string;
  private readonly dbPath: string;
  private db: DatabaseSync;
  private closed = false;
  private syncing: Promise<void> | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private dirty = true;
  private dirtySessionKeys = new Set<string>();
  private sessionUnsubscribe: (() => void) | null = null;

  static async get(params: {
    cfg: OpenClawConfig;
    agentId: string;
  }): Promise<SessionSearchManager> {
    const { cfg, agentId } = params;
    const key = `session-search:${agentId}`;
    const existing = INDEX_CACHE.get(key);
    if (existing) {
      return existing;
    }
    const manager = new SessionSearchManager({ cacheKey: key, cfg, agentId });
    INDEX_CACHE.set(key, manager);
    return manager;
  }

  private constructor(params: { cacheKey: string; cfg: OpenClawConfig; agentId: string }) {
    this.cacheKey = params.cacheKey;
    this.cfg = params.cfg;
    this.agentId = params.agentId;
    this.dbPath = this.resolveDbPath();
    this.db = this.openDatabase();
    this.ensureSchema();
    this.ensureSessionListener();
  }

  private resolveDbPath(): string {
    const agentDir = resolveAgentDir(this.cfg, this.agentId);
    return path.join(agentDir, "session-search.db");
  }

  private openDatabase(): DatabaseSync {
    const dir = path.dirname(this.dbPath);
    ensureDir(dir);
    const { DatabaseSync } = requireNodeSqlite();
    return new DatabaseSync(this.dbPath, { allowExtension: true });
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_key TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        updated_at INTEGER,
        indexed_at INTEGER,
        chunk_count INTEGER DEFAULT 0
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY,
        session_key TEXT NOT NULL,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        created_at INTEGER,
        embedding TEXT,
        FOREIGN KEY (session_key) REFERENCES sessions(session_key) ON DELETE CASCADE
      );
    `);

    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_chunks_session_key ON chunks(session_key);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_chunks_role ON chunks(role);`);

    // FTS5 table for keyword search
    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS ${FTS_TABLE} USING fts5(
          content,
          session_key UNINDEXED,
          session_id UNINDEXED,
          role UNINDEXED,
          chunk_id UNINDEXED,
          created_at UNINDEXED
        );
      `);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`FTS5 unavailable: ${message}`);
    }
  }

  private ensureSessionListener(): void {
    if (this.sessionUnsubscribe) {
      return;
    }
    this.sessionUnsubscribe = onSessionTranscriptUpdate((update) => {
      if (this.closed) {
        return;
      }
      const sessionFile = update.sessionFile;
      if (!this.isSessionFileForAgent(sessionFile)) {
        return;
      }
      // Mark session as dirty for re-indexing
      const sessionId = path.basename(sessionFile, ".jsonl");
      this.dirtySessionKeys.add(sessionId);
      this.dirty = true;
      this.scheduleSyncDebounced();
    });
  }

  private isSessionFileForAgent(sessionFile: string): boolean {
    if (!sessionFile) {
      return false;
    }
    const sessionsDir = resolveSessionTranscriptsDirForAgent(this.agentId);
    const resolvedFile = path.resolve(sessionFile);
    const resolvedDir = path.resolve(sessionsDir);
    return resolvedFile.startsWith(`${resolvedDir}${path.sep}`);
  }

  private scheduleSyncDebounced(): void {
    if (this.syncTimer) {
      return;
    }
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      void this.sync().catch((err) => {
        log.warn(`session search sync failed: ${String(err)}`);
      });
    }, SYNC_DEBOUNCE_MS);
  }

  async search(params: SessionSearchParams): Promise<SessionSearchResult[]> {
    const { query, limit = 20, minScore = 0.1, includeArchived = false } = params;

    const cleaned = query.trim();
    if (!cleaned) {
      return [];
    }

    // Trigger sync if dirty
    if (this.dirty) {
      void this.sync().catch((err) => {
        log.warn(`session search sync failed: ${String(err)}`);
      });
    }

    // FTS search
    const ftsResults = await this.searchFts(cleaned, limit * 3);

    // Group by session and compute combined score
    const bySession = new Map<
      string,
      {
        sessionKey: string;
        sessionId: string;
        matches: Array<{ score: number; snippet: string; role: string; createdAt: number | null }>;
        updatedAt: number | null;
      }
    >();

    for (const r of ftsResults) {
      const key = r.sessionKey;
      let entry = bySession.get(key);
      if (!entry) {
        entry = {
          sessionKey: r.sessionKey,
          sessionId: r.sessionId,
          matches: [],
          updatedAt: r.updatedAt,
        };
        bySession.set(key, entry);
      }
      entry.matches.push({
        score: r.score,
        snippet: r.snippet,
        role: r.role,
        createdAt: r.createdAt,
      });
    }

    // Compute final scores with recency boost
    const results: SessionSearchResult[] = [];
    const sessionStore = this.loadSessionStore();

    for (const entry of bySession.values()) {
      // Get best match score and snippet
      const best = entry.matches.reduce(
        (acc, m) => (m.score > acc.score ? m : acc),
        entry.matches[0]!,
      );

      // Apply recency boost
      const recencyBoost = this.computeRecencyBoost(entry.updatedAt);
      const finalScore = best.score * (1 + recencyBoost);

      if (finalScore < minScore) {
        continue;
      }

      // Check if archived
      const storeEntry = sessionStore[entry.sessionKey];
      if (!includeArchived && storeEntry?.archived) {
        continue;
      }

      // Derive title
      const derivedTitle = this.deriveSessionTitle(entry.sessionKey, storeEntry);

      results.push({
        sessionKey: entry.sessionKey,
        sessionId: entry.sessionId,
        score: finalScore,
        matchCount: entry.matches.length,
        snippet: best.snippet,
        snippetRole: best.role as "user" | "assistant",
        updatedAt: entry.updatedAt,
        derivedTitle,
      });
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit);
  }

  private async searchFts(
    query: string,
    limit: number,
  ): Promise<
    Array<{
      sessionKey: string;
      sessionId: string;
      score: number;
      snippet: string;
      role: string;
      createdAt: number | null;
      updatedAt: number | null;
    }>
  > {
    const ftsQuery = buildFtsQuery(query);
    if (!ftsQuery) {
      return [];
    }

    try {
      const rows = this.db
        .prepare(
          `SELECT
            f.content,
            f.session_key,
            f.session_id,
            f.role,
            f.created_at,
            s.updated_at,
            rank
          FROM ${FTS_TABLE} f
          JOIN sessions s ON s.session_key = f.session_key
          WHERE ${FTS_TABLE} MATCH ?
          ORDER BY rank
          LIMIT ?`,
        )
        .all(ftsQuery, limit) as Array<{
        content: string;
        session_key: string;
        session_id: string;
        role: string;
        created_at: number | null;
        updated_at: number | null;
        rank: number;
      }>;

      return rows.map((row) => ({
        sessionKey: row.session_key,
        sessionId: row.session_id,
        score: bm25RankToScore(row.rank),
        snippet: this.extractSnippet(row.content, query),
        role: row.role,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (err) {
      log.debug(`FTS search failed: ${String(err)}`);
      return [];
    }
  }

  private extractSnippet(content: string, query: string): string {
    const normalized = content.replace(/\s+/g, " ").trim();
    if (normalized.length <= SNIPPET_MAX_CHARS) {
      return normalized;
    }

    // Try to find query terms in content
    const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const lowerContent = normalized.toLowerCase();

    let bestPos = 0;
    for (const term of queryTerms) {
      const pos = lowerContent.indexOf(term);
      if (pos !== -1) {
        bestPos = pos;
        break;
      }
    }

    // Extract snippet around best position
    const start = Math.max(0, bestPos - SNIPPET_MAX_CHARS / 3);
    const end = Math.min(normalized.length, start + SNIPPET_MAX_CHARS);

    let snippet = normalized.slice(start, end);
    if (start > 0) {
      snippet = "…" + snippet;
    }
    if (end < normalized.length) {
      snippet = snippet + "…";
    }

    return snippet;
  }

  private computeRecencyBoost(updatedAt: number | null): number {
    if (!updatedAt) {
      return 0;
    }
    const ageMs = Date.now() - updatedAt;
    const ageHours = ageMs / (1000 * 60 * 60);
    // Decay: 0.5 boost for recent, decaying to 0 over 30 days (720 hours)
    return Math.max(0, 0.5 * Math.exp(-ageHours / 720));
  }

  private loadSessionStore(): Record<
    string,
    { archived?: boolean; label?: string; displayName?: string; subject?: string }
  > {
    try {
      const storePath = resolveStorePath(this.cfg.session?.store, { agentId: this.agentId });
      return loadSessionStore(storePath);
    } catch {
      return {};
    }
  }

  private deriveSessionTitle(
    _sessionKey: string,
    entry?: { label?: string; displayName?: string; subject?: string },
  ): string | undefined {
    if (entry?.label?.trim()) {
      return entry.label.trim();
    }
    if (entry?.displayName?.trim()) {
      return entry.displayName.trim();
    }
    if (entry?.subject?.trim()) {
      return entry.subject.trim();
    }
    return undefined;
  }

  async indexSession(sessionKey: string, sessionId: string): Promise<void> {
    const sessionsDir = resolveSessionTranscriptsDirForAgent(this.agentId);
    const transcriptPath = path.join(sessionsDir, `${sessionId}.jsonl`);

    let rawContent: string;
    try {
      rawContent = await fs.readFile(transcriptPath, "utf-8");
    } catch {
      // Transcript doesn't exist, remove from index
      await this.removeSession(sessionKey);
      return;
    }

    const messages = this.parseTranscript(rawContent);
    if (messages.length === 0) {
      await this.removeSession(sessionKey);
      return;
    }

    const now = Date.now();

    // Begin transaction
    this.db.exec("BEGIN");
    try {
      // Delete existing chunks for this session
      this.db.prepare(`DELETE FROM chunks WHERE session_key = ?`).run(sessionKey);
      this.db.prepare(`DELETE FROM ${FTS_TABLE} WHERE session_key = ?`).run(sessionKey);

      // Insert new chunks
      const insertChunk = this.db.prepare(
        `INSERT INTO chunks (session_key, session_id, role, content, chunk_index, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      const insertFts = this.db.prepare(
        `INSERT INTO ${FTS_TABLE} (content, session_key, session_id, role, chunk_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );

      let chunkIndex = 0;
      for (const msg of messages) {
        const result = insertChunk.run(
          sessionKey,
          sessionId,
          msg.role,
          msg.content,
          chunkIndex,
          msg.createdAt ?? null,
        );
        const chunkId = Number(result.lastInsertRowid);

        insertFts.run(msg.content, sessionKey, sessionId, msg.role, chunkId, msg.createdAt ?? null);

        chunkIndex++;
      }

      // Update session metadata
      this.db
        .prepare(
          `INSERT INTO sessions (session_key, session_id, updated_at, indexed_at, chunk_count)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(session_key) DO UPDATE SET
             session_id = excluded.session_id,
             updated_at = excluded.updated_at,
             indexed_at = excluded.indexed_at,
             chunk_count = excluded.chunk_count`,
        )
        .run(sessionKey, sessionId, now, now, chunkIndex);

      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  private parseTranscript(
    rawContent: string,
  ): Array<{ role: "user" | "assistant"; content: string; createdAt?: number }> {
    const messages: Array<{ role: "user" | "assistant"; content: string; createdAt?: number }> = [];
    const lines = rawContent.split("\n");

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      let record: unknown;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }

      if (!record || typeof record !== "object") {
        continue;
      }

      const typed = record as { type?: unknown; message?: unknown; ts?: unknown };
      if (typed.type !== "message") {
        continue;
      }

      const message = typed.message as { role?: unknown; content?: unknown } | undefined;
      if (!message || typeof message !== "object") {
        continue;
      }

      if (message.role !== "user" && message.role !== "assistant") {
        continue;
      }

      const content = this.extractMessageContent(message.content);
      if (!content) {
        continue;
      }

      messages.push({
        role: message.role as "user" | "assistant",
        content,
        createdAt: typeof typed.ts === "number" ? typed.ts : undefined,
      });
    }

    return messages;
  }

  private extractMessageContent(content: unknown): string | null {
    if (typeof content === "string") {
      const normalized = content.replace(/\s+/g, " ").trim();
      return normalized || null;
    }

    if (!Array.isArray(content)) {
      return null;
    }

    const parts: string[] = [];
    for (const block of content) {
      if (!block || typeof block !== "object") {
        continue;
      }
      const typed = block as { type?: unknown; text?: unknown };
      if (typed.type !== "text" || typeof typed.text !== "string") {
        continue;
      }
      const normalized = typed.text.replace(/\s+/g, " ").trim();
      if (normalized) {
        parts.push(normalized);
      }
    }

    return parts.length > 0 ? parts.join(" ") : null;
  }

  async removeSession(sessionKey: string): Promise<void> {
    this.db.exec("BEGIN");
    try {
      this.db.prepare(`DELETE FROM ${FTS_TABLE} WHERE session_key = ?`).run(sessionKey);
      this.db.prepare(`DELETE FROM chunks WHERE session_key = ?`).run(sessionKey);
      this.db.prepare(`DELETE FROM sessions WHERE session_key = ?`).run(sessionKey);
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  async sync(opts?: { force?: boolean }): Promise<void> {
    if (this.syncing) {
      return this.syncing;
    }
    this.syncing = this.runSync(opts).finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }

  private async runSync(opts?: { force?: boolean }): Promise<void> {
    const force = opts?.force ?? false;

    // List all session transcripts
    const sessionsDir = resolveSessionTranscriptsDirForAgent(this.agentId);
    let transcriptFiles: string[] = [];
    try {
      const entries = await fs.readdir(sessionsDir, { withFileTypes: true });
      transcriptFiles = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
        .map((entry) => entry.name);
    } catch {
      // Directory doesn't exist yet
      return;
    }

    // Load session store to get session keys
    const sessionStore = this.loadSessionStore();
    const sessionIdToKey = new Map<string, string>();
    for (const [key, entry] of Object.entries(sessionStore)) {
      const typedEntry = entry as { sessionId?: string };
      if (typedEntry.sessionId) {
        sessionIdToKey.set(typedEntry.sessionId, key);
      }
    }

    // Get currently indexed sessions
    const indexedSessions = new Map<string, { sessionId: string; indexedAt: number | null }>();
    const rows = this.db
      .prepare(`SELECT session_key, session_id, indexed_at FROM sessions`)
      .all() as SessionRow[];
    for (const row of rows) {
      indexedSessions.set(row.session_key, {
        sessionId: row.session_id,
        indexedAt: row.indexed_at,
      });
    }

    // Index new or modified sessions
    for (const fileName of transcriptFiles) {
      const sessionId = fileName.replace(/\.jsonl$/, "");
      // Skip topic-based sessions for now (they have -topic- in the name)
      if (sessionId.includes("-topic-")) {
        continue;
      }

      const sessionKey = sessionIdToKey.get(sessionId) ?? sessionId;
      const existing = indexedSessions.get(sessionKey);

      // Check if needs indexing
      const transcriptPath = path.join(sessionsDir, fileName);
      let stat: { mtimeMs: number };
      try {
        stat = await fs.stat(transcriptPath);
      } catch {
        continue;
      }

      const needsIndex =
        force ||
        !existing ||
        existing.sessionId !== sessionId ||
        !existing.indexedAt ||
        stat.mtimeMs > existing.indexedAt;

      if (needsIndex) {
        try {
          await this.indexSession(sessionKey, sessionId);
          log.debug(`indexed session: ${sessionKey}`);
        } catch (err) {
          log.warn(`failed to index session ${sessionKey}: ${String(err)}`);
        }
      }

      indexedSessions.delete(sessionKey);
    }

    // Remove stale sessions that no longer exist
    for (const sessionKey of indexedSessions.keys()) {
      try {
        await this.removeSession(sessionKey);
        log.debug(`removed stale session from index: ${sessionKey}`);
      } catch (err) {
        log.warn(`failed to remove session ${sessionKey}: ${String(err)}`);
      }
    }

    this.dirty = false;
    this.dirtySessionKeys.clear();
  }

  status(): {
    dbPath: string;
    sessions: number;
    chunks: number;
    dirty: boolean;
  } {
    const sessionsRow = this.db.prepare(`SELECT COUNT(*) as c FROM sessions`).get() as {
      c: number;
    };
    const chunksRow = this.db.prepare(`SELECT COUNT(*) as c FROM chunks`).get() as { c: number };

    return {
      dbPath: this.dbPath,
      sessions: sessionsRow?.c ?? 0,
      chunks: chunksRow?.c ?? 0,
      dirty: this.dirty,
    };
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;

    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }

    if (this.sessionUnsubscribe) {
      this.sessionUnsubscribe();
      this.sessionUnsubscribe = null;
    }

    this.db.close();
    INDEX_CACHE.delete(this.cacheKey);
  }
}

/**
 * Get the session search manager for the default agent
 */
export async function getSessionSearchManager(
  cfg: OpenClawConfig,
  agentId?: string,
): Promise<SessionSearchManager> {
  const resolvedAgentId = agentId ?? resolveDefaultAgentId(cfg);
  return SessionSearchManager.get({ cfg, agentId: resolvedAgentId });
}
