import { Type } from "@sinclair/typebox";
import { stringEnum } from "../schema/typebox.js";

const DEVTOOLS_ACTIONS = ["logs", "state", "eval", "errors"] as const;

export const KosDevtoolsToolSchema = Type.Object({
  action: stringEnum(DEVTOOLS_ACTIONS, {
    description:
      "logs: Recent console output (main + renderer). state: Zustand store snapshots. eval: Evaluate JS in renderer context. errors: Filtered error/warn view.",
  }),
  level: Type.Optional(
    stringEnum(["log", "info", "warn", "error", "debug"] as const, {
      description: "Filter logs by level (for logs action)",
    }),
  ),
  limit: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 500,
      description: "Max entries to return (default: 100)",
    }),
  ),
  source: Type.Optional(
    stringEnum(["main", "renderer"] as const, {
      description: "Filter by log source (for logs/errors action, default: both)",
    }),
  ),
  store: Type.Optional(
    Type.String({
      description:
        "Store name to snapshot (for state action, e.g. 'gateway', 'panel'). Omit for summary of all stores.",
    }),
  ),
  path: Type.Optional(
    Type.String({
      description:
        "Dot-delimited path into store state (for state action, e.g. 'connected' or 'hello.auth')",
    }),
  ),
  expression: Type.Optional(
    Type.String({
      description: "JS expression to evaluate in renderer context (for eval action)",
    }),
  ),
  node: Type.Optional(
    Type.String({
      description: "Node ID to route to (optional, auto-routes to first devtools-capable node)",
    }),
  ),
});
