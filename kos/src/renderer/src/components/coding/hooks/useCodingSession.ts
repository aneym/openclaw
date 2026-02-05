/**
 * useCodingSession hook — parse tool events to detect coding session phases.
 *
 * Phases:
 * - exploring: Read, web_search, web_fetch tools
 * - planning: Long text output with no tool calls
 * - building: Write, Edit, exec tools (non-test)
 * - testing: exec with test commands (npm test, pytest, vitest, etc.)
 * - complete: Session ended successfully
 * - error: Session ended with error
 */

import { useState, useEffect } from "react";
import type { ChatMessage, ToolCallPart, ToolResultPart } from "../../../types/message";
import type { CodingPhase } from "../PhaseIndicator";
import { normalizeMessage } from "../../../gateway/normalize";
import { sessionKeysMatch } from "../../../lib/session-keys";
import { useGatewayStore } from "../../../stores/gateway-store";

interface CodingEvent {
  id: string;
  type: "tool-call" | "tool-result" | "text" | "phase-change";
  toolName?: string;
  args?: Record<string, unknown>;
  text?: string;
  phase: CodingPhase;
  timestamp: number;
  duration?: number;
}

interface ChatEventPayload {
  runId: string;
  sessionKey: string;
  state: "delta" | "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
}

interface SessionHistoryResponse {
  messages: unknown[];
}

/**
 * Detect phase based on tool name and arguments.
 */
function detectPhase(toolName: string, args: Record<string, unknown>): CodingPhase {
  // Exploring: Read, search, fetch operations
  if (["Read", "Grep", "Glob", "web_search", "web_fetch", "LSP"].includes(toolName)) {
    return "exploring";
  }

  // Building: Write/Edit operations
  if (["Write", "Edit", "NotebookEdit"].includes(toolName)) {
    return "building";
  }

  // Testing or Building: exec commands
  if (toolName === "Bash" || toolName === "exec") {
    const cmd = String(args.command ?? "");
    // Test-like commands
    if (
      /\b(test|spec|jest|pytest|vitest|mocha|npm test|pnpm test|bun test|cargo test|go test)\b/i.test(
        cmd,
      )
    ) {
      return "testing";
    }
    // Build commands
    return "building";
  }

  // Task/planning tools
  if (toolName === "Task" || toolName === "EnterPlanMode") {
    return "planning";
  }

  // Default to exploring
  return "exploring";
}

/**
 * Detect if a long text message indicates planning phase.
 * Planning is characterized by lengthy reasoning or explanation without tool calls.
 */
function isLongTextPlanning(message: ChatMessage): boolean {
  const hasToolCalls = message.parts.some((p) => p.type === "tool-call");
  if (hasToolCalls) {
    return false;
  }

  const textParts = message.parts.filter((p) => p.type === "text");
  const totalTextLength = textParts.reduce((sum, p) => {
    return sum + ((p as { text?: string }).text?.length ?? 0);
  }, 0);

  // Consider it planning if there's substantial text (>200 chars) without tool calls
  return totalTextLength > 200;
}

/**
 * Convert ChatMessage parts to CodingEvent array.
 */
function messageToCodingEvents(message: ChatMessage, prevPhase: CodingPhase): CodingEvent[] {
  const events: CodingEvent[] = [];
  let currentPhase = prevPhase;

  // Check if this is a long text planning message
  if (message.role === "assistant" && isLongTextPlanning(message)) {
    currentPhase = "planning";
  }

  for (const part of message.parts) {
    if (part.type === "tool-call") {
      const toolCall = part as ToolCallPart;
      const detectedPhase = detectPhase(toolCall.toolName, toolCall.args);

      // Phase change event if transitioning
      if (detectedPhase !== currentPhase) {
        events.push({
          id: `phase-${message.id}-${toolCall.toolCallId}`,
          type: "phase-change",
          phase: detectedPhase,
          timestamp: message.createdAt,
        });
        currentPhase = detectedPhase;
      }

      events.push({
        id: toolCall.toolCallId,
        type: "tool-call",
        toolName: toolCall.toolName,
        args: toolCall.args,
        phase: currentPhase,
        timestamp: message.createdAt,
      });
    } else if (part.type === "tool-result") {
      const toolResult = part as ToolResultPart;
      events.push({
        id: `result-${toolResult.toolCallId}`,
        type: "tool-result",
        toolName: toolResult.toolName,
        phase: currentPhase,
        timestamp: message.createdAt,
      });
    } else if (part.type === "text") {
      const text = (part as { text?: string }).text;
      if (text && text.trim()) {
        events.push({
          id: `text-${message.id}`,
          type: "text",
          text: text.trim().substring(0, 200), // Truncate for display
          phase: currentPhase,
          timestamp: message.createdAt,
        });
      }
    }
  }

  return events;
}

export function useCodingSession(sessionKey: string) {
  const [events, setEvents] = useState<CodingEvent[]>([]);
  const [phase, setPhase] = useState<CodingPhase>("exploring");
  const [startTime] = useState(Date.now());
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(true);
  const { request, subscribe } = useGatewayStore();

  // Update duration every second
  useEffect(() => {
    const interval = setInterval(() => {
      setDuration(Date.now() - startTime);
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  // Fetch session history and build initial event timeline
  useEffect(() => {
    if (!sessionKey) {
      setLoading(false);
      return;
    }

    setLoading(true);

    request<SessionHistoryResponse>("chat.history", { sessionKey, limit: 100 })
      .then((history) => {
        const messages = history.messages.map((m) => normalizeMessage(m, sessionKey));

        let currentPhase: CodingPhase = "exploring";
        const allEvents: CodingEvent[] = [];

        for (const message of messages) {
          const messageEvents = messageToCodingEvents(message, currentPhase);
          allEvents.push(...messageEvents);

          // Update phase tracking
          const lastPhaseChange = messageEvents.find((e) => e.type === "phase-change");
          if (lastPhaseChange) {
            currentPhase = lastPhaseChange.phase;
          }
        }

        setEvents(allEvents);
        setPhase(currentPhase);
        setLoading(false);
      })
      .catch((err) => {
        console.error("[useCodingSession] failed to fetch history:", err);
        setLoading(false);
      });
  }, [sessionKey, request]);

  // Subscribe to chat events and update events
  useEffect(() => {
    if (!sessionKey) {
      return;
    }

    const unsubscribe = subscribe("chat", (payload) => {
      const event = payload as ChatEventPayload;
      if (sessionKeysMatch(event.sessionKey, sessionKey) && event.message) {
        const message = normalizeMessage(event.message, sessionKey);

        setEvents((prevEvents) => {
          const currentPhase =
            prevEvents.length > 0 ? prevEvents[prevEvents.length - 1].phase : "exploring";

          const newEvents = messageToCodingEvents(message, currentPhase);

          // Update phase if there's a phase change
          const lastPhaseChange = newEvents.find((e) => e.type === "phase-change");
          if (lastPhaseChange) {
            setPhase(lastPhaseChange.phase);
          }

          return [...prevEvents, ...newEvents];
        });
      }
    });

    return unsubscribe;
  }, [sessionKey, subscribe]);

  return {
    events,
    phase,
    duration,
    loading,
  };
}
