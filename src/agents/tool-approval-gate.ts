import { callGatewayTool } from "./tools/gateway.js";
import { jsonResult } from "./tools/common.js";
import type { AnyAgentTool } from "./pi-tools.types.js";

const DEFAULT_APPROVAL_TIMEOUT_MS = 130_000;
const DEFAULT_APPROVAL_REQUEST_TIMEOUT_MS = 140_000;

/**
 * Check whether a tool name matches any pattern in the `tools.ask` list.
 * Supports exact matches and simple glob patterns (trailing `*`).
 */
export function requiresToolApproval(toolName: string, askPatterns: string[]): boolean {
  const lower = toolName.toLowerCase();
  for (const pattern of askPatterns) {
    const p = pattern.toLowerCase().trim();
    if (!p) continue;
    if (p.endsWith("*")) {
      if (lower.startsWith(p.slice(0, -1))) return true;
    } else if (lower === p) {
      return true;
    }
  }
  return false;
}

/**
 * Wraps a tool's `execute` method with a blocking approval gate.
 * When the tool is invoked, it sends a `tool.approval.request` RPC to the gateway
 * and waits for a user decision before proceeding.
 *
 * Session-scoped `allowAlwaysSet` tracks tools that received "allow-always",
 * so subsequent calls within the same session skip the approval prompt.
 */
export function wrapToolWithApprovalGate(
  tool: AnyAgentTool,
  opts: {
    allowAlwaysSet: Set<string>;
    agentId?: string | null;
    sessionKey?: string | null;
  },
): AnyAgentTool {
  const originalExecute = tool.execute;
  if (!originalExecute) return tool;

  return {
    ...tool,
    execute: async (toolCallId, params, signal, onUpdate) => {
      const toolName = tool.name ?? "unknown";

      // Skip approval if "allow-always" was previously granted for this tool.
      if (opts.allowAlwaysSet.has(toolName.toLowerCase())) {
        return await originalExecute(toolCallId, params, signal, onUpdate);
      }

      let decision: string | null = null;
      try {
        const result = (await callGatewayTool(
          "tool.approval.request",
          { timeoutMs: DEFAULT_APPROVAL_REQUEST_TIMEOUT_MS },
          {
            toolName,
            toolInput: params ?? {},
            agentId: opts.agentId ?? undefined,
            sessionKey: opts.sessionKey ?? undefined,
            timeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS,
          },
        )) as { decision?: string } | null;
        decision = result?.decision ?? null;
      } catch {
        // Gateway unreachable or request failed — treat as denied.
        decision = null;
      }

      if (decision === "allow-always") {
        opts.allowAlwaysSet.add(toolName.toLowerCase());
        return await originalExecute(toolCallId, params, signal, onUpdate);
      }

      if (decision === "allow-once") {
        return await originalExecute(toolCallId, params, signal, onUpdate);
      }

      // Denied or timed out.
      const reason = decision === "deny" ? "denied by user" : "timed out waiting for approval";
      return jsonResult({
        status: "error",
        error: `Tool "${toolName}" was not approved: ${reason}`,
      });
    },
  };
}
