import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { stripToolMessages } from "../agents/tools/sessions-helpers.js";
import { callGateway, type CallGatewayOptions } from "../gateway/call.js";

/**
 * Read the callback session key from the environment.
 * Set by the spawning agent (e.g. PayMe) so Codex can report back
 * without needing to discover the session key.
 */
function getCallbackSessionKey(): string | undefined {
  const raw = process.env.OPENCLAW_SESSION_KEY?.trim();
  return raw || undefined;
}

function normalizeBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizePositiveInt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  if (value <= 0) {
    return undefined;
  }
  return Math.floor(value);
}

function normalizeLimit(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(200, Math.max(1, Math.floor(value)));
}

function extractPlainTextFromMessage(msg: unknown): { role: string; text: string } | null {
  if (!msg || typeof msg !== "object") {
    return null;
  }
  const roleRaw = (msg as { role?: unknown }).role;
  const role = typeof roleRaw === "string" ? roleRaw : "";
  const content = (msg as { content?: unknown }).content;
  let text = "";
  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      if (!block || typeof block !== "object") {
        continue;
      }
      if ((block as { type?: unknown }).type !== "text") {
        continue;
      }
      const chunk = (block as { text?: unknown }).text;
      if (typeof chunk === "string" && chunk.trim()) {
        parts.push(chunk);
      }
    }
    text = parts.join(" ");
  }
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }
  return { role, text: normalized };
}

export type OpenClawMcpServeOptions = {
  gatewayUrl?: string;
  tlsFingerprint?: string;
  clientDisplayName?: string;
};

/** Build shared callGateway options from serve-level opts. */
function baseCallOpts(opts: OpenClawMcpServeOptions | undefined): Partial<CallGatewayOptions> {
  return {
    ...(opts?.gatewayUrl ? { url: opts.gatewayUrl } : {}),
    ...(opts?.tlsFingerprint ? { tlsFingerprint: opts.tlsFingerprint } : {}),
    clientDisplayName: opts?.clientDisplayName ?? "OpenClaw MCP",
    timeoutMs: 30_000,
  };
}

interface SessionListEntry {
  key?: string;
  label?: string;
  displayName?: string;
  updatedAt?: number;
  channel?: string;
}

export async function serveOpenClawMcpServer(opts?: OpenClawMcpServeOptions): Promise<void> {
  const server = new McpServer({
    name: "openclaw",
    version: "1.0.0",
  });

  const shared = baseCallOpts(opts);
  const callbackKey = getCallbackSessionKey();

  // ── report_back ───────────────────────────────────────────────
  // Zero-config tool: uses OPENCLAW_SESSION_KEY from env (set by spawning agent).
  server.registerTool(
    "report_back",
    {
      title: "Report Back to Spawning Agent",
      description:
        "Send a message back to the OpenClaw agent that spawned this session. " +
        "No session key needed — it uses the OPENCLAW_SESSION_KEY environment variable " +
        "set by the spawning agent. Use this when you finish a task and want to notify " +
        "the agent that asked you to do it." +
        (callbackKey
          ? ` (Callback session: ${callbackKey})`
          : " (WARNING: OPENCLAW_SESSION_KEY not set — this tool will fail.)"),
      inputSchema: {
        message: z.string().describe("The message to send back to the spawning agent."),
        deliver: z
          .boolean()
          .optional()
          .describe("Whether to deliver to connected channels (default true)."),
      },
    },
    async (args) => {
      if (!callbackKey) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                "Error: OPENCLAW_SESSION_KEY environment variable is not set. " +
                "The spawning agent must set this when launching Codex. " +
                "Use session_send with an explicit sessionKey instead, or use list_sessions to find the right key.",
            },
          ],
          isError: true,
        };
      }
      const message = args.message.trim();
      if (!message) {
        return {
          content: [{ type: "text" as const, text: "Error: message is required." }],
          isError: true,
        };
      }

      const deliver = normalizeBool(args.deliver, true);
      try {
        const payload = await callGateway({
          ...shared,
          method: "agent",
          params: {
            sessionKey: callbackKey,
            message,
            deliver,
            idempotencyKey: randomUUID(),
          },
          expectFinal: false,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { reported: true, sessionKey: callbackKey, ...payload },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ── list_sessions ─────────────────────────────────────────────
  server.registerTool(
    "list_sessions",
    {
      title: "List Sessions",
      description:
        "List active OpenClaw sessions. Returns session keys you can use with session_send and session_history. " +
        "Session keys follow the format 'agent:<agentId>:<rest>' (e.g. 'agent:payme:main').",
      inputSchema: {
        agentId: z
          .string()
          .optional()
          .describe("Filter by agent ID (e.g. 'payme'). Omit to list all agents."),
        limit: z.number().optional().describe("Max sessions to return (default 20)."),
      },
    },
    async (args) => {
      const limit = normalizeLimit(args.limit, 20);
      try {
        const payload = await callGateway<{ sessions?: SessionListEntry[] }>({
          ...shared,
          method: "sessions.list",
          params: {
            ...(args.agentId ? { agentId: args.agentId.trim() } : {}),
            limit,
          },
        });
        const sessions = Array.isArray(payload?.sessions) ? payload.sessions : [];
        const items = sessions.map((s) => ({
          sessionKey: s.key,
          label: s.label || s.displayName,
          channel: s.channel,
          updatedAt: s.updatedAt,
        }));
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ sessions: items }, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ── session_send ──────────────────────────────────────────────
  server.registerTool(
    "session_send",
    {
      title: "Send Message To Session",
      description:
        "Send a message to a specific OpenClaw session. " +
        "Prefer report_back if you just need to notify the agent that spawned you. " +
        "Session keys must be the full key (e.g. 'agent:payme:main'), not just the agent name.",
      inputSchema: {
        sessionKey: z
          .string()
          .describe(
            "Full session key (e.g. 'agent:payme:main'). Use list_sessions to discover keys.",
          ),
        message: z.string(),
        deliver: z
          .boolean()
          .optional()
          .describe("Whether to deliver the response to connected channels (default true)."),
        thinking: z.string().optional(),
        timeoutSeconds: z.number().nonnegative().optional(),
        idempotencyKey: z.string().optional(),
      },
    },
    async (args) => {
      const sessionKey = args.sessionKey.trim();
      const message = args.message.trim();
      if (!sessionKey) {
        return {
          content: [{ type: "text" as const, text: "Error: sessionKey is required." }],
          isError: true,
        };
      }
      if (!message) {
        return {
          content: [{ type: "text" as const, text: "Error: message is required." }],
          isError: true,
        };
      }

      const deliver = normalizeBool(args.deliver, true);
      const thinking =
        typeof args.thinking === "string" && args.thinking.trim() ? args.thinking : undefined;
      const timeoutSeconds = normalizePositiveInt(args.timeoutSeconds);
      const idempotencyKey =
        typeof args.idempotencyKey === "string" && args.idempotencyKey.trim()
          ? args.idempotencyKey.trim()
          : randomUUID();

      try {
        const payload = await callGateway({
          ...shared,
          method: "agent",
          params: {
            sessionKey,
            message,
            deliver,
            thinking,
            timeout: timeoutSeconds,
            idempotencyKey,
          },
          expectFinal: false,
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ── session_history ───────────────────────────────────────────
  server.registerTool(
    "session_history",
    {
      title: "Get Session History",
      description:
        "Fetch recent messages for a session. Useful for polling agent replies after session_send. " +
        "Use the full session key (e.g. 'agent:payme:main').",
      inputSchema: {
        sessionKey: z
          .string()
          .describe(
            "Full session key (e.g. 'agent:payme:main'). Use list_sessions to discover keys.",
          ),
        limit: z.number().optional(),
        includeTools: z.boolean().optional(),
      },
    },
    async (args) => {
      const sessionKey = args.sessionKey.trim();
      if (!sessionKey) {
        return {
          content: [{ type: "text" as const, text: "Error: sessionKey is required." }],
          isError: true,
        };
      }
      const limit = normalizeLimit(args.limit, 50);
      const includeTools = normalizeBool(args.includeTools, false);

      try {
        const payload = await callGateway<{ messages?: unknown[] }>({
          ...shared,
          method: "chat.history",
          params: { sessionKey, limit },
        });
        const rawMessages = Array.isArray(payload?.messages) ? payload.messages : [];
        const filtered = includeTools ? rawMessages : stripToolMessages(rawMessages);
        const messages = filtered
          .map(extractPlainTextFromMessage)
          .filter((m): m is { role: string; text: string } => Boolean(m));
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ sessionKey, messages }, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
