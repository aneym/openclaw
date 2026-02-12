export type ParsedAgentSessionKey = {
  agentId: string;
  rest: string;
};

export function parseAgentSessionKey(
  sessionKey: string | undefined | null,
): ParsedAgentSessionKey | null {
  const raw = (sessionKey ?? "").trim();
  if (!raw) {
    return null;
  }
  const parts = raw.split(":").filter(Boolean);
  if (parts.length < 3) {
    return null;
  }
  if (parts[0]?.toLowerCase() !== "agent") {
    return null;
  }
  const agentId = parts[1]?.trim().toLowerCase();
  const rest = parts.slice(2).join(":");
  if (!agentId || !rest) {
    return null;
  }
  return { agentId, rest };
}

/**
 * Compare session keys while tolerating canonical `agent:<id>:` prefixes.
 */
export function sessionKeysMatch(
  a: string | undefined | null,
  b: string | undefined | null,
): boolean {
  const aTrim = (a ?? "").trim();
  const bTrim = (b ?? "").trim();
  if (!aTrim || !bTrim) {
    return false;
  }
  if (aTrim === bTrim) {
    return true;
  }

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
 * Expand a session key into equivalent aliases used across UI/runtime layers.
 */
export function sessionKeyVariants(sessionKey: string | undefined | null): string[] {
  const raw = (sessionKey ?? "").trim();
  if (!raw) {
    return [];
  }
  const variants = new Set<string>([raw]);
  const parsed = parseAgentSessionKey(raw);
  if (parsed) {
    variants.add(parsed.rest);
  }
  return [...variants];
}
