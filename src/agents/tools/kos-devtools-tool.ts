import crypto from "node:crypto";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam, readNumberParam } from "./common.js";
import { callGatewayTool } from "./gateway.js";
import { KosDevtoolsToolSchema } from "./kos-devtools-tool.schema.js";
import { listNodes, resolveNodeIdFromList, type NodeListNode } from "./nodes-utils.js";

type DevtoolsProxyResult = {
  ok: boolean;
  payload?: unknown;
  payloadJSON?: string;
  error?: { code?: string; message?: string } | null;
};

const DEFAULT_DEVTOOLS_TIMEOUT_MS = 15_000;

function isDevtoolsNode(node: NodeListNode): boolean {
  const commands = Array.isArray(node.commands) ? node.commands : [];
  return commands.some((c) => c.startsWith("devtools."));
}

async function findDevtoolsNode(requestedNode?: string): Promise<{
  nodeId: string;
  label?: string;
} | null> {
  const nodes = await listNodes({});
  const devtoolsNodes = nodes.filter((node) => node.connected && isDevtoolsNode(node));

  if (devtoolsNodes.length === 0) {
    return null;
  }

  if (requestedNode) {
    const nodeId = resolveNodeIdFromList(devtoolsNodes, requestedNode, false);
    const node = devtoolsNodes.find((n) => n.nodeId === nodeId);
    return { nodeId, label: node?.displayName ?? node?.remoteIp ?? nodeId };
  }

  if (devtoolsNodes.length === 1) {
    const node = devtoolsNodes[0];
    return { nodeId: node.nodeId, label: node.displayName ?? node.remoteIp ?? node.nodeId };
  }

  throw new Error(
    `Multiple devtools-capable nodes connected (${devtoolsNodes.length}). Pass node=<id|name> to select.`,
  );
}

async function invokeDevtoolsCommand(
  nodeId: string,
  command: string,
  params: Record<string, unknown>,
  timeoutMs = DEFAULT_DEVTOOLS_TIMEOUT_MS,
): Promise<unknown> {
  const result = await callGatewayTool<DevtoolsProxyResult>(
    "node.invoke",
    { timeoutMs },
    {
      nodeId,
      command: `devtools.${command}`,
      params,
      idempotencyKey: crypto.randomUUID(),
    },
  );

  if (!result?.ok) {
    const errMsg = result?.error?.message ?? "devtools command failed";
    throw new Error(errMsg);
  }

  if (result.payloadJSON && typeof result.payloadJSON === "string") {
    return JSON.parse(result.payloadJSON);
  }

  return result.payload;
}

export function createKosDevtoolsTool(): AnyAgentTool {
  return {
    label: "kOS DevTools",
    name: "kos_devtools",
    description: [
      "Inspect kOS app state for debugging — logs, store snapshots, eval, errors.",
      "Actions:",
      "- logs: Recent console output from main + renderer processes. Filter by level/source.",
      "- state: Snapshot Zustand stores. Omit store for summary; specify store/path to drill in.",
      "- eval: Evaluate a JS expression in the renderer context (sandbox-safe, no filesystem).",
      "- errors: Filtered view of error/warn entries from both processes.",
    ].join("\n"),
    parameters: KosDevtoolsToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const requestedNode = readStringParam(params, "node");

      const nodeTarget = await findDevtoolsNode(requestedNode);
      if (!nodeTarget) {
        throw new Error("No kOS client with devtools capability connected");
      }

      switch (action) {
        case "logs": {
          const level = readStringParam(params, "level");
          const limit = readNumberParam(params, "limit", { integer: true });
          const source = readStringParam(params, "source");
          const result = await invokeDevtoolsCommand(nodeTarget.nodeId, "logs", {
            level,
            limit,
            source,
          });
          return jsonResult(result);
        }

        case "state": {
          const store = readStringParam(params, "store");
          const path = readStringParam(params, "path");
          const result = await invokeDevtoolsCommand(nodeTarget.nodeId, "state", {
            store,
            path,
          });
          return jsonResult(result);
        }

        case "eval": {
          const expression = readStringParam(params, "expression", { required: true });
          if (expression.length > 10_000) {
            throw new Error("Expression too long (max 10,000 characters)");
          }
          const result = await invokeDevtoolsCommand(nodeTarget.nodeId, "eval", {
            expression,
          });
          return jsonResult(result);
        }

        case "errors": {
          const limit = readNumberParam(params, "limit", { integer: true });
          const source = readStringParam(params, "source");
          const result = await invokeDevtoolsCommand(nodeTarget.nodeId, "errors", {
            limit,
            source,
          });
          return jsonResult(result);
        }

        default:
          throw new Error(`Unknown action: ${action}`);
      }
    },
  };
}
