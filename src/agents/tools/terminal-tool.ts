import crypto from "node:crypto";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam, readNumberParam } from "./common.js";
import { callGatewayTool } from "./gateway.js";
import { listNodes, resolveNodeIdFromList, type NodeListNode } from "./nodes-utils.js";
import { TerminalToolSchema } from "./terminal-tool.schema.js";

type TerminalProxyResult = {
  ok: boolean;
  payload?: unknown;
  payloadJSON?: string;
  error?: { code?: string; message?: string } | null;
};

const DEFAULT_TERMINAL_PROXY_TIMEOUT_MS = 30_000;

function isTerminalNode(node: NodeListNode): boolean {
  const caps = Array.isArray(node.caps) ? node.caps : [];
  const commands = Array.isArray(node.commands) ? node.commands : [];
  return caps.includes("terminal") || commands.some((c) => c.startsWith("terminal."));
}

async function findTerminalNode(requestedNode?: string): Promise<{
  nodeId: string;
  label?: string;
} | null> {
  const nodes = await listNodes({});
  const terminalNodes = nodes.filter((node) => node.connected && isTerminalNode(node));

  if (terminalNodes.length === 0) {
    return null;
  }

  if (requestedNode) {
    const nodeId = resolveNodeIdFromList(terminalNodes, requestedNode, false);
    const node = terminalNodes.find((n) => n.nodeId === nodeId);
    return { nodeId, label: node?.displayName ?? node?.remoteIp ?? nodeId };
  }

  // Auto-select single node
  if (terminalNodes.length === 1) {
    const node = terminalNodes[0];
    return { nodeId: node.nodeId, label: node.displayName ?? node.remoteIp ?? node.nodeId };
  }

  // Multiple nodes - require explicit selection
  throw new Error(
    `Multiple terminal-capable nodes connected (${terminalNodes.length}). Pass node=<id|name> to select.`,
  );
}

async function invokeTerminalCommand(
  nodeId: string,
  command: string,
  params: Record<string, unknown>,
  timeoutMs = DEFAULT_TERMINAL_PROXY_TIMEOUT_MS,
): Promise<unknown> {
  const result = await callGatewayTool<TerminalProxyResult>(
    "node.invoke",
    { timeoutMs },
    {
      nodeId,
      command: `terminal.${command}`,
      params,
      idempotencyKey: crypto.randomUUID(),
    },
  );

  if (!result?.ok) {
    const errMsg = result?.error?.message ?? "terminal command failed";
    throw new Error(errMsg);
  }

  // Parse payloadJSON if present
  if (result.payloadJSON && typeof result.payloadJSON === "string") {
    return JSON.parse(result.payloadJSON);
  }

  return result.payload;
}

export function createTerminalTool(): AnyAgentTool {
  return {
    label: "Terminal",
    name: "terminal",
    description: [
      "Control terminals on connected kOS clients.",
      "Actions:",
      "- spawn: Create a new visible terminal window (returns terminalId)",
      "- exec: Run a command in a terminal (requires terminalId, command)",
      "- read: Read recent output from terminal scrollback (requires terminalId)",
      "- copy: Copy terminal output to user's clipboard (requires terminalId)",
      "- close: Close a terminal (requires terminalId)",
      "- list: List all active managed terminals",
      "",
      "Terminals spawn visibly in kOS so users can watch commands execute.",
      "The user can intervene (e.g., Ctrl+C) but a badge shows AI control.",
      "Use spawn to create a terminal, then exec to run commands.",
      "Check output with read if exec doesn't return expected results.",
      "Use copy to put output in clipboard for the user to paste elsewhere.",
    ].join("\n"),
    parameters: TerminalToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const requestedNode = readStringParam(params, "node");

      const nodeTarget = await findTerminalNode(requestedNode);
      if (!nodeTarget) {
        throw new Error("No kOS client with terminal capability connected");
      }

      switch (action) {
        case "spawn": {
          const cwd = readStringParam(params, "cwd");
          const result = await invokeTerminalCommand(nodeTarget.nodeId, "spawn", { cwd });
          return jsonResult(result);
        }

        case "exec": {
          const terminalId = readStringParam(params, "terminalId", { required: true });
          const command = readStringParam(params, "command", { required: true });
          const timeoutMs = readNumberParam(params, "timeoutMs", { integer: true });
          const result = await invokeTerminalCommand(
            nodeTarget.nodeId,
            "exec",
            { terminalId, command, timeoutMs },
            timeoutMs ?? DEFAULT_TERMINAL_PROXY_TIMEOUT_MS,
          );
          return jsonResult(result);
        }

        case "read": {
          const terminalId = readStringParam(params, "terminalId", { required: true });
          const since = readNumberParam(params, "since", { integer: true });
          const maxBytes = readNumberParam(params, "maxBytes", { integer: true });
          const result = await invokeTerminalCommand(nodeTarget.nodeId, "read", {
            terminalId,
            since,
            maxBytes,
          });
          return jsonResult(result);
        }

        case "close": {
          const terminalId = readStringParam(params, "terminalId", { required: true });
          const force = typeof params.force === "boolean" ? params.force : false;
          const result = await invokeTerminalCommand(nodeTarget.nodeId, "close", {
            terminalId,
            force,
          });
          return jsonResult(result);
        }

        case "copy": {
          const terminalId = readStringParam(params, "terminalId", { required: true });
          const result = await invokeTerminalCommand(nodeTarget.nodeId, "copy", { terminalId });
          return jsonResult(result);
        }

        case "list": {
          const result = await invokeTerminalCommand(nodeTarget.nodeId, "list", {});
          return jsonResult(result);
        }

        default:
          throw new Error(`Unknown action: ${action}`);
      }
    },
  };
}
