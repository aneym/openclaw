import { Type } from "@sinclair/typebox";
import crypto from "node:crypto";
import type { AnyAgentTool } from "./common.js";
import { loadConfig } from "../../config/config.js";
import { callGateway } from "../../gateway/call.js";
import {
  isSubagentSessionKey,
  normalizeAgentId,
  parseAgentSessionKey,
} from "../../routing/session-key.js";
import { listAgentIds, resolveAgentConfig } from "../agent-scope.js";
import { jsonResult, readStringParam } from "./common.js";
import { resolveInternalSessionKey, resolveMainSessionAlias } from "./sessions-helpers.js";

const SessionsTransferToolSchema = Type.Object({
  agentId: Type.String({ minLength: 1, maxLength: 64 }),
  message: Type.String(),
  label: Type.Optional(Type.String()),
  channel: Type.Optional(Type.String()),
});

function buildSessionTransferLink(params: {
  sessionKey: string;
  agentId: string;
  agentName?: string;
  label?: string;
}): string {
  // Prefer a canonical deep-link string that UIs can recognize and render as a card.
  // The desktop/mobile apps may choose to handle this scheme; webchat renders it as
  // an in-app open button (no OS-level protocol handler required).
  const url = new URL("openclaw://session");
  url.searchParams.set("key", params.sessionKey);
  url.searchParams.set("agentId", params.agentId);
  if (params.agentName?.trim()) {
    url.searchParams.set("agentName", params.agentName.trim());
  }
  if (params.label?.trim()) {
    url.searchParams.set("label", params.label.trim());
  }
  return url.toString();
}

export function createSessionsTransferTool(opts?: {
  agentSessionKey?: string;
  /** Explicit agent ID override for cron/hook sessions where session key parsing may not work. */
  requesterAgentIdOverride?: string;
  sandboxed?: boolean;
}): AnyAgentTool {
  return {
    label: "Sessions",
    name: "sessions_transfer",
    description:
      "Create a new interactive session for another agent, seed it with a context message, and return a link the user can open.",
    parameters: SessionsTransferToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const rawAgentId = readStringParam(params, "agentId", { required: true });
      const message = readStringParam(params, "message", { required: true, allowEmpty: true });
      const label = typeof params.label === "string" ? params.label.trim() : "";
      const channel = typeof params.channel === "string" ? params.channel.trim().toLowerCase() : "";

      const cfg = loadConfig();
      const { mainKey, alias } = resolveMainSessionAlias(cfg);

      const requesterSessionKey =
        typeof opts?.agentSessionKey === "string" ? opts.agentSessionKey : "";
      if (requesterSessionKey && isSubagentSessionKey(requesterSessionKey)) {
        return jsonResult({
          status: "forbidden",
          error: "sessions_transfer is not allowed from sub-agent sessions",
        });
      }

      const requesterInternalKey = requesterSessionKey
        ? resolveInternalSessionKey({
            key: requesterSessionKey,
            alias,
            mainKey,
          })
        : alias;

      const requesterAgentId = normalizeAgentId(
        opts?.requesterAgentIdOverride ?? parseAgentSessionKey(requesterInternalKey)?.agentId,
      );
      const targetAgentId = normalizeAgentId(rawAgentId);

      const configuredAgentIds = listAgentIds(cfg);
      if (!configuredAgentIds.includes(targetAgentId)) {
        return jsonResult({
          status: "error",
          error: `Unknown agentId: ${targetAgentId}`,
          availableAgents: configuredAgentIds,
        });
      }

      if (targetAgentId !== requesterAgentId) {
        const allowAgents = resolveAgentConfig(cfg, requesterAgentId)?.subagents?.allowAgents ?? [];
        const allowAny = allowAgents.some((value) => value.trim() === "*");
        const normalizedTargetId = targetAgentId.toLowerCase();
        const allowSet = new Set(
          allowAgents
            .filter((value) => value.trim() && value.trim() !== "*")
            .map((value) => normalizeAgentId(value).toLowerCase()),
        );
        if (!allowAny && !allowSet.has(normalizedTargetId)) {
          const allowedText = allowAny
            ? "*"
            : allowSet.size > 0
              ? Array.from(allowSet).join(", ")
              : "none";
          return jsonResult({
            status: "forbidden",
            error: `agentId is not allowed for sessions_transfer (allowed: ${allowedText})`,
          });
        }
      }

      // Today this always creates a webchat-style thread key, even if invoked from
      // another channel. Users can open it later in a UI client.
      if (channel && channel !== "webchat") {
        // Keep the parameter for future extensibility, but don't silently lie
        // about where the interactive thread exists.
        return jsonResult({
          status: "error",
          error: `channel must be "webchat" (got: "${channel}")`,
        });
      }

      const uuid = crypto.randomUUID();
      const requestedSessionKey = `agent:${targetAgentId}:webchat:thread:${uuid}`;

      let sessionKey = requestedSessionKey;
      let sessionId: string | undefined;
      try {
        const patched = await callGateway<{
          ok?: boolean;
          key?: string;
          entry?: { sessionId?: string };
        }>({
          method: "sessions.patch",
          params: {
            key: requestedSessionKey,
            ...(label ? { label } : {}),
          },
          timeoutMs: 10_000,
        });
        if (typeof patched?.key === "string" && patched.key.trim()) {
          sessionKey = patched.key.trim();
        }
        const patchedId = patched?.entry?.sessionId;
        if (typeof patchedId === "string" && patchedId.trim()) {
          sessionId = patchedId.trim();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return jsonResult({
          status: "error",
          error: msg || "failed to create session",
        });
      }

      // Seed the new interactive session by triggering a normal agent run.
      // This ensures the target agent's workspace/config/memory are used.
      try {
        await callGateway({
          method: "chat.send",
          params: {
            sessionKey,
            message,
            deliver: false,
            idempotencyKey: `transfer-${uuid}`,
          },
          timeoutMs: 10_000,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return jsonResult({
          status: "error",
          error: msg || "failed to seed session",
          sessionKey,
          sessionId,
        });
      }

      const agentCfg = resolveAgentConfig(cfg, targetAgentId);
      const agentName = agentCfg?.name?.trim() || targetAgentId;
      const link = buildSessionTransferLink({
        sessionKey,
        agentId: targetAgentId,
        agentName,
        label: label || undefined,
      });

      return jsonResult({
        status: "ok",
        sessionKey,
        sessionId,
        agentId: targetAgentId,
        agentName,
        label: label || undefined,
        link,
        // Web UI supports `?session=...` (useful on surfaces that don't handle openclaw:// links).
        webLink: `?session=${encodeURIComponent(sessionKey)}`,
      });
    },
  };
}
