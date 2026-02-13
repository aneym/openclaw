import type { Command } from "commander";
import { setVerbose } from "../../globals.js";
import { serveOpenClawMcpServer } from "../../mcp/openclaw-mcp.js";

export function registerMcpCommands(program: Command) {
  const mcp = program
    .command("mcp")
    .description("Run the OpenClaw MCP server (for Codex, Claude Code, etc.)")
    .action(() => {
      mcp.help({ error: true });
    });

  mcp
    .command("serve")
    .description("Serve MCP tools over stdio")
    .option("--gateway-url <url>", "Gateway WS URL override (requires token/password env vars)")
    .option("--tls-fingerprint <fingerprint>", "TLS fingerprint for wss:// connections")
    .option("--client-display-name <name>", "Gateway client display name (default: OpenClaw MCP)")
    .action(async (opts) => {
      // MCP stdio servers must not write to stdout (it corrupts the protocol stream).
      setVerbose(false);
      await serveOpenClawMcpServer({
        gatewayUrl: opts.gatewayUrl as string | undefined,
        tlsFingerprint: opts.tlsFingerprint as string | undefined,
        clientDisplayName: opts.clientDisplayName as string | undefined,
      });
    });
}
