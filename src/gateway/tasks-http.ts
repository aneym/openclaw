/**
 * tasks-http.ts — HTTP API for task management and kanban board
 *
 * GET    /api/tasks/projects              → list projects
 * POST   /api/tasks/projects              → create project
 * PATCH  /api/tasks/projects/:id          → update project
 * DELETE /api/tasks/projects/:id          → delete project
 *
 * GET    /api/tasks?project=<slug>&status=<s>  → list tasks (filterable)
 * POST   /api/tasks                       → create task
 * GET    /api/tasks/:id                   → get task + comments
 * PATCH  /api/tasks/:id                   → update task
 * PATCH  /api/tasks/:id/reorder           → update sort_order (kanban drag)
 * DELETE /api/tasks/:id                   → delete task
 *
 * POST   /api/tasks/:id/comments          → add comment
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config/config.js";
import { requireNodeSqlite } from "../memory/sqlite.js";
import { authorizeGatewayConnect, type ResolvedGatewayAuth } from "./auth.js";
import { getBearerToken } from "./http-utils.js";

type DatabaseSync = ReturnType<typeof requireNodeSqlite>["DatabaseSync"];

let db: InstanceType<DatabaseSync> | null = null;

function getDbPath(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "~";
  const openclawDir = join(homeDir, ".openclaw");
  if (!existsSync(openclawDir)) {
    mkdirSync(openclawDir, { recursive: true });
  }
  return join(openclawDir, "tasks.db");
}

function initDb(): InstanceType<DatabaseSync> {
  if (db) {
    return db;
  }

  const { DatabaseSync } = requireNodeSqlite();
  const dbPath = getDbPath();
  db = new DatabaseSync(dbPath);

  // Enable WAL mode for concurrent access
  db.exec("PRAGMA journal_mode = WAL;");

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      agent TEXT,
      description TEXT,
      color TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'backlog'
        CHECK(status IN ('backlog','todo','in_progress','blocked','review','done','cancelled')),
      priority TEXT NOT NULL DEFAULT 'medium'
        CHECK(priority IN ('none','low','medium','high','urgent')),
      assigned_to TEXT,
      created_by TEXT,
      sort_order REAL NOT NULL DEFAULT 0,
      labels TEXT DEFAULT '[]',
      due_date INTEGER,
      metadata TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_comments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      author TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_tasks_sort ON tasks(project_id, status, sort_order);
    CREATE INDEX IF NOT EXISTS idx_comments_task ON task_comments(task_id);
  `);

  return db;
}

// Simple ULID generator (timestamp + random)
function generateUlid(): string {
  const timestamp = Date.now().toString(36).toUpperCase().padStart(10, "0");
  const random = Math.random().toString(36).substring(2, 12).toUpperCase().padEnd(10, "0");
  return timestamp + random;
}

function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function parseQuery(req: IncomingMessage): URLSearchParams {
  const qIdx = req.url?.indexOf("?") ?? -1;
  return new URLSearchParams(qIdx >= 0 ? req.url!.slice(qIdx + 1) : "");
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

async function requireAuth(
  req: IncomingMessage,
  res: ServerResponse,
  auth: ResolvedGatewayAuth,
  trustedProxies: string[],
): Promise<boolean> {
  const token = getBearerToken(req);
  const authResult = await authorizeGatewayConnect({
    auth,
    connectAuth: token ? { token, password: token } : null,
    req,
    trustedProxies,
  });
  if (!authResult.ok) {
    res.writeHead(401, { "Content-Type": "text/plain" });
    res.end("Unauthorized");
    return false;
  }
  return true;
}

export async function handleTasksHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: { auth: ResolvedGatewayAuth; trustedProxies?: string[] },
): Promise<boolean> {
  const { auth } = opts;
  const cfg = loadConfig();
  const trustedProxies = opts.trustedProxies ?? cfg.gateway?.trustedProxies ?? [];

  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const pathname = url.pathname;

  if (!pathname.startsWith("/api/tasks")) {
    return false;
  }

  // Initialize DB on first request
  const database = initDb();

  /* ── Projects ── */

  // GET /api/tasks/projects
  if (req.method === "GET" && pathname === "/api/tasks/projects") {
    const stmt = database.prepare("SELECT * FROM projects ORDER BY created_at DESC");
    const projects = stmt.all();
    json(res, { projects });
    return true;
  }

  // POST /api/tasks/projects (create)
  if (req.method === "POST" && pathname === "/api/tasks/projects") {
    if (!(await requireAuth(req, res, auth, trustedProxies))) {
      return true;
    }

    const bodyRaw = await readBody(req);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(bodyRaw);
    } catch {
      json(res, { error: "Invalid JSON" }, 400);
      return true;
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    if (!name || !slug) {
      json(res, { error: "name and slug are required" }, 400);
      return true;
    }

    const id = generateUlid();
    const now = Date.now();
    const agent = typeof body.agent === "string" ? body.agent.trim() || null : null;
    const description = typeof body.description === "string" ? body.description : null;
    const color = typeof body.color === "string" ? body.color : null;

    try {
      const stmt = database.prepare(
        "INSERT INTO projects (id, name, slug, agent, description, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      );
      stmt.run(id, name, slug, agent, description, color, now, now);
      json(res, { ok: true, id }, 201);
    } catch (e: unknown) {
      const err = e as Error;
      json(res, { error: err.message }, 400);
    }
    return true;
  }

  // PATCH /api/tasks/projects/:id (update)
  if (req.method === "PATCH" && /^\/api\/tasks\/projects\/[^/]+$/.test(pathname)) {
    if (!(await requireAuth(req, res, auth, trustedProxies))) {
      return true;
    }

    const id = pathname.split("/")[4];
    const bodyRaw = await readBody(req);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(bodyRaw);
    } catch {
      json(res, { error: "Invalid JSON" }, 400);
      return true;
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    if (typeof body.name === "string" && body.name.trim()) {
      updates.push("name = ?");
      values.push(body.name.trim());
    }
    if (typeof body.slug === "string" && body.slug.trim()) {
      updates.push("slug = ?");
      values.push(body.slug.trim());
    }
    if ("agent" in body) {
      updates.push("agent = ?");
      values.push(typeof body.agent === "string" ? body.agent.trim() || null : null);
    }
    if ("description" in body) {
      updates.push("description = ?");
      values.push(typeof body.description === "string" ? body.description : null);
    }
    if ("color" in body) {
      updates.push("color = ?");
      values.push(typeof body.color === "string" ? body.color : null);
    }
    updates.push("updated_at = ?");
    values.push(Date.now());

    if (updates.length === 1) {
      json(res, { ok: true });
      return true;
    }

    values.push(id);
    try {
      const stmt = database.prepare(`UPDATE projects SET ${updates.join(", ")} WHERE id = ?`);
      stmt.run(...values);
      json(res, { ok: true });
    } catch (e: unknown) {
      const err = e as Error;
      json(res, { error: err.message }, 400);
    }
    return true;
  }

  // DELETE /api/tasks/projects/:id
  if (req.method === "DELETE" && /^\/api\/tasks\/projects\/[^/]+$/.test(pathname)) {
    if (!(await requireAuth(req, res, auth, trustedProxies))) {
      return true;
    }

    const id = pathname.split("/")[4];
    const stmt = database.prepare("DELETE FROM projects WHERE id = ?");
    stmt.run(id);
    json(res, { ok: true });
    return true;
  }

  /* ── Tasks ── */

  // GET /api/tasks?project=<slug>&status=<s>
  if (req.method === "GET" && pathname === "/api/tasks") {
    const query = parseQuery(req);
    const projectSlug = query.get("project");
    const statusFilter = query.get("status");

    let sql = `
      SELECT t.* FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
    `;
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (projectSlug) {
      conditions.push("p.slug = ?");
      values.push(projectSlug);
    }
    if (statusFilter) {
      conditions.push("t.status = ?");
      values.push(statusFilter);
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }
    sql += " ORDER BY t.sort_order ASC, t.created_at DESC";

    const stmt = database.prepare(sql);
    const tasks = stmt.all(...values);
    json(res, { tasks });
    return true;
  }

  // POST /api/tasks (create)
  if (req.method === "POST" && pathname === "/api/tasks") {
    if (!(await requireAuth(req, res, auth, trustedProxies))) {
      return true;
    }

    const bodyRaw = await readBody(req);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(bodyRaw);
    } catch {
      json(res, { error: "Invalid JSON" }, 400);
      return true;
    }

    const projectId = typeof body.project_id === "string" ? body.project_id.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!projectId || !title) {
      json(res, { error: "project_id and title are required" }, 400);
      return true;
    }

    const id = generateUlid();
    const now = Date.now();
    const status = typeof body.status === "string" ? body.status : "backlog";
    const priority = typeof body.priority === "string" ? body.priority : "medium";
    const description = typeof body.description === "string" ? body.description : null;
    const assignedTo = typeof body.assigned_to === "string" ? body.assigned_to : null;
    const createdBy = typeof body.created_by === "string" ? body.created_by : null;
    const sortOrder = typeof body.sort_order === "number" ? body.sort_order : 0;
    const labels =
      typeof body.labels === "string" ? body.labels : JSON.stringify(body.labels || []);
    const dueDate = typeof body.due_date === "number" ? body.due_date : null;
    const metadata =
      typeof body.metadata === "string" ? body.metadata : JSON.stringify(body.metadata || {});

    try {
      const stmt = database.prepare(`
        INSERT INTO tasks (
          id, project_id, title, description, status, priority, assigned_to, created_by,
          sort_order, labels, due_date, metadata, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        id,
        projectId,
        title,
        description,
        status,
        priority,
        assignedTo,
        createdBy,
        sortOrder,
        labels,
        dueDate,
        metadata,
        now,
        now,
      );
      json(res, { ok: true, id }, 201);
    } catch (e: unknown) {
      const err = e as Error;
      json(res, { error: err.message }, 400);
    }
    return true;
  }

  // GET /api/tasks/:id (with comments)
  if (req.method === "GET" && /^\/api\/tasks\/[^/]+$/.test(pathname)) {
    const id = pathname.split("/")[3];
    const taskStmt = database.prepare("SELECT * FROM tasks WHERE id = ?");
    const task = taskStmt.get(id);
    if (!task) {
      json(res, { error: "Task not found" }, 404);
      return true;
    }
    const commentsStmt = database.prepare(
      "SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC",
    );
    const comments = commentsStmt.all(id);
    json(res, { task, comments });
    return true;
  }

  // PATCH /api/tasks/:id/reorder (drag-drop reorder)
  if (req.method === "PATCH" && /^\/api\/tasks\/[^/]+\/reorder$/.test(pathname)) {
    if (!(await requireAuth(req, res, auth, trustedProxies))) {
      return true;
    }

    const id = pathname.split("/")[3];
    const bodyRaw = await readBody(req);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(bodyRaw);
    } catch {
      json(res, { error: "Invalid JSON" }, 400);
      return true;
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    if (typeof body.status === "string") {
      updates.push("status = ?");
      values.push(body.status);
    }
    if (typeof body.sort_order === "number") {
      updates.push("sort_order = ?");
      values.push(body.sort_order);
    }
    updates.push("updated_at = ?");
    values.push(Date.now());

    values.push(id);
    const stmt = database.prepare(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`);
    stmt.run(...values);
    json(res, { ok: true });
    return true;
  }

  // PATCH /api/tasks/:id (general update)
  if (
    req.method === "PATCH" &&
    /^\/api\/tasks\/[^/]+$/.test(pathname) &&
    !pathname.endsWith("/reorder")
  ) {
    if (!(await requireAuth(req, res, auth, trustedProxies))) {
      return true;
    }

    const id = pathname.split("/")[3];
    const bodyRaw = await readBody(req);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(bodyRaw);
    } catch {
      json(res, { error: "Invalid JSON" }, 400);
      return true;
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    if (typeof body.title === "string") {
      updates.push("title = ?");
      values.push(body.title);
    }
    if ("description" in body) {
      updates.push("description = ?");
      values.push(typeof body.description === "string" ? body.description : null);
    }
    if (typeof body.status === "string") {
      updates.push("status = ?");
      values.push(body.status);
    }
    if (typeof body.priority === "string") {
      updates.push("priority = ?");
      values.push(body.priority);
    }
    if ("assigned_to" in body) {
      updates.push("assigned_to = ?");
      values.push(typeof body.assigned_to === "string" ? body.assigned_to : null);
    }
    if ("labels" in body) {
      updates.push("labels = ?");
      values.push(
        typeof body.labels === "string" ? body.labels : JSON.stringify(body.labels || []),
      );
    }
    if ("due_date" in body) {
      updates.push("due_date = ?");
      values.push(typeof body.due_date === "number" ? body.due_date : null);
    }
    if ("metadata" in body) {
      updates.push("metadata = ?");
      values.push(
        typeof body.metadata === "string" ? body.metadata : JSON.stringify(body.metadata || {}),
      );
    }
    updates.push("updated_at = ?");
    values.push(Date.now());

    if (updates.length === 1) {
      json(res, { ok: true });
      return true;
    }

    values.push(id);
    const stmt = database.prepare(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`);
    stmt.run(...values);
    json(res, { ok: true });
    return true;
  }

  // DELETE /api/tasks/:id
  if (req.method === "DELETE" && /^\/api\/tasks\/[^/]+$/.test(pathname)) {
    if (!(await requireAuth(req, res, auth, trustedProxies))) {
      return true;
    }

    const id = pathname.split("/")[3];
    const stmt = database.prepare("DELETE FROM tasks WHERE id = ?");
    stmt.run(id);
    json(res, { ok: true });
    return true;
  }

  // POST /api/tasks/:id/comments (add comment)
  if (req.method === "POST" && /^\/api\/tasks\/[^/]+\/comments$/.test(pathname)) {
    if (!(await requireAuth(req, res, auth, trustedProxies))) {
      return true;
    }

    const taskId = pathname.split("/")[3];
    const bodyRaw = await readBody(req);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(bodyRaw);
    } catch {
      json(res, { error: "Invalid JSON" }, 400);
      return true;
    }

    const author = typeof body.author === "string" ? body.author.trim() : "";
    const commentBody = typeof body.body === "string" ? body.body.trim() : "";
    if (!author || !commentBody) {
      json(res, { error: "author and body are required" }, 400);
      return true;
    }

    const id = generateUlid();
    const now = Date.now();
    try {
      const stmt = database.prepare(
        "INSERT INTO task_comments (id, task_id, author, body, created_at) VALUES (?, ?, ?, ?, ?)",
      );
      stmt.run(id, taskId, author, commentBody, now);
      json(res, { ok: true, id }, 201);
    } catch (e: unknown) {
      const err = e as Error;
      json(res, { error: err.message }, 400);
    }
    return true;
  }

  return false;
}
