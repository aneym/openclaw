import { Type } from "@sinclair/typebox";
import { stringEnum } from "../schema/typebox.js";

const TERMINAL_TOOL_ACTIONS = ["spawn", "exec", "read", "copy", "close", "list"] as const;

export const TerminalToolSchema = Type.Object({
  action: stringEnum(TERMINAL_TOOL_ACTIONS, {
    description:
      "spawn: Create a new visible terminal. exec: Run a command. read: Read recent output. copy: Copy output to user's clipboard. close: Close terminal. list: List active terminals.",
  }),
  terminalId: Type.Optional(
    Type.String({
      description: "Terminal ID (required for exec/read/close)",
    }),
  ),
  command: Type.Optional(
    Type.String({
      description: "Command to execute (required for exec)",
    }),
  ),
  cwd: Type.Optional(
    Type.String({
      description: "Working directory for new terminal (optional for spawn)",
    }),
  ),
  timeoutMs: Type.Optional(
    Type.Integer({
      minimum: 100,
      maximum: 300000,
      description: "Timeout in milliseconds for exec (default: 30000)",
    }),
  ),
  force: Type.Optional(
    Type.Boolean({
      description: "Force close without saving scrollback (for close)",
    }),
  ),
  node: Type.Optional(
    Type.String({
      description: "Node ID to route to (optional, auto-routes to first terminal-capable node)",
    }),
  ),
});
