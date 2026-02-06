import { Type } from "@sinclair/typebox";
import { stringEnum } from "../schema/typebox.js";

const TERMINAL_TOOL_ACTIONS = ["spawn", "exec", "read", "copy", "close", "list", "write"] as const;

export const TerminalToolSchema = Type.Object({
  action: stringEnum(TERMINAL_TOOL_ACTIONS, {
    description:
      "spawn: Create a new visible terminal. exec: Run a command (with sentinel-based output capture). read: Read recent output. copy: Copy output to user's clipboard. close: Close terminal. list: List active terminals. write: Send raw text to terminal (for interactive programs like vim, htop — newline appended automatically).",
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
  text: Type.Optional(
    Type.String({
      description:
        "Text to write to terminal (required for write). Newline appended automatically.",
    }),
  ),
  cwd: Type.Optional(
    Type.String({
      description: "Working directory for new terminal (optional for spawn)",
    }),
  ),
  label: Type.Optional(
    Type.String({
      description: "Display label for the terminal tab (e.g. 'dev server', 'build')",
    }),
  ),
  target: Type.Optional(
    stringEnum(["tab", "pane"], {
      description:
        "Where to open: 'tab' adds to existing terminal panel (default), 'pane' creates new split",
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
