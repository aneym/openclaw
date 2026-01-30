export type {
  EmbeddedPiAgentMeta,
  EmbeddedPiCompactResult,
  EmbeddedPiRunMeta,
  EmbeddedPiRunResult,
} from "./pi-embedded-runner.js";
export {
  abortEmbeddedPiRun,
  compactEmbeddedPiSession,
  isEmbeddedPiRunActive,
  isEmbeddedPiRunStreaming,
  queueEmbeddedPiMessage,
  resolveEmbeddedSessionLane,
  waitForEmbeddedPiRunEnd,
} from "./pi-embedded-runner.js";
// Re-export the dispatcher as `runEmbeddedPiAgent` so all existing call sites
// and test mocks keep working. The dispatcher routes to Pi or Claude Agent SDK
// based on config.agents.runtime.
export { runAgent, runAgent as runEmbeddedPiAgent } from "./runtime-dispatcher.js";
