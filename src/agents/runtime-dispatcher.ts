import type { RunEmbeddedPiAgentParams } from "./pi-embedded-runner/run/params.js";
import { runEmbeddedPiAgent } from "./pi-embedded-runner/run.js";
import type { EmbeddedPiRunResult } from "./pi-embedded-runner/types.js";

/**
 * Dispatches agent runs to the configured runtime engine.
 * Reads `params.config?.agents?.runtime` and routes accordingly.
 * Defaults to 'pi' (the existing Pi agent runtime) when not set.
 */
export async function runAgent(params: RunEmbeddedPiAgentParams): Promise<EmbeddedPiRunResult> {
  const runtime = params.config?.agents?.runtime ?? "pi";

  if (runtime === "claude-agent-sdk") {
    const { runClaudeAgentSDK } = await import("./claude-sdk-runner/run.js");
    return runClaudeAgentSDK(params);
  }

  return runEmbeddedPiAgent(params);
}
