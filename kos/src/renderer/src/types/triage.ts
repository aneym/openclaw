export type TriageSource = "gateway" | "claude" | "codex" | "terminal";

export type TriageEventState = "pending" | "handled" | "skipped";

export interface TriageEvent {
  id: string;
  source: TriageSource;
  sourceEventId?: string;

  // Gateway chats
  chatId?: string;
  sessionKey?: string;

  // Terminals
  terminalId?: string;

  title: string;
  preview?: string;
  occurredAt: number;

  state: TriageEventState;
}
