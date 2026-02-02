import type { AnyAgentTool } from "./pi-tools.types.js";

function throwAbortError(): never {
  const err = new Error("Aborted");
  err.name = "AbortError";
  throw err;
}

// Coerce to a real AbortSignal; drop plain objects that were misrouted
// through the adapter (e.g. ExtensionContext with an `aborted` property).
function asSignal(v: unknown): AbortSignal | undefined {
  return v instanceof AbortSignal ? v : undefined;
}

function combineAbortSignals(a?: unknown, b?: unknown): AbortSignal | undefined {
  const sa = asSignal(a);
  const sb = asSignal(b);
  if (!sa && !sb) {
    return undefined;
  }
  if (sa && !sb) {
    return sa;
  }
  if (sb && !sa) {
    return sb;
  }
  if (sa?.aborted) {
    return sa;
  }
  if (sb?.aborted) {
    return sb;
  }
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([sa as AbortSignal, sb as AbortSignal]);
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  sa?.addEventListener("abort", onAbort, { once: true });
  sb?.addEventListener("abort", onAbort, { once: true });
  return controller.signal;
}

export function wrapToolWithAbortSignal(
  tool: AnyAgentTool,
  abortSignal?: AbortSignal,
): AnyAgentTool {
  if (!abortSignal) {
    return tool;
  }
  const execute = tool.execute;
  if (!execute) {
    return tool;
  }
  return {
    ...tool,
    execute: async (toolCallId, params, signal, onUpdate) => {
      const combined = combineAbortSignals(signal, abortSignal);
      if (combined?.aborted) {
        throwAbortError();
      }
      return await execute(toolCallId, params, combined, onUpdate);
    },
  };
}
