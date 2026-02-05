type ParsedAgentSessionKey = {
  agentId: string;
  rest: string;
};

export function parseAgentSessionKey(key: string): ParsedAgentSessionKey | null {
  const trimmed = key.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^agent:([^:]+):(.+)$/i);
  if (!match) return null;
  return {
    agentId: match[1]?.toLowerCase() ?? "",
    rest: match[2] ?? "",
  };
}

export function normalizeSessionKey(key: string | undefined | null): string {
  if (!key) return "";
  const trimmed = key.trim();
  if (!trimmed) return "";
  const parsed = parseAgentSessionKey(trimmed);
  return parsed ? parsed.rest : trimmed;
}

export function sessionKeysMatch(
  a: string | undefined | null,
  b: string | undefined | null,
): boolean {
  if (!a || !b) return false;
  const aTrim = a.trim();
  const bTrim = b.trim();
  if (!aTrim || !bTrim) return false;

  const aParsed = parseAgentSessionKey(aTrim);
  const bParsed = parseAgentSessionKey(bTrim);

  if (aParsed && bParsed) {
    return aParsed.agentId === bParsed.agentId && aParsed.rest === bParsed.rest;
  }

  const aRest = aParsed ? aParsed.rest : aTrim;
  const bRest = bParsed ? bParsed.rest : bTrim;
  return aRest === bRest;
}

/**
 * Build a canonical session key with the `agent:{agentId}:{rest}` prefix.
 * If the key already has the prefix it is returned as-is.
 */
export function buildSessionKey(agentId: string, rest: string): string {
  // Already prefixed — return as-is
  if (rest.startsWith("agent:")) return rest;
  return `agent:${agentId}:${rest}`;
}
