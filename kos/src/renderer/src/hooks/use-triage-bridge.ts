import { useEffect } from "react";
import { createTerminalTriageEvent, useTriageStore } from "../stores/triage-store";

export function useTriageBridge() {
  const enqueue = useTriageStore((s) => s.enqueue);

  useEffect(() => {
    const unsub = window.api?.triageBridge?.onEvent?.((event) => {
      enqueue(
        createTerminalTriageEvent({
          source: event.source,
          terminalId: event.terminalId,
          title: event.title,
          preview: event.preview,
          occurredAt: event.occurredAt,
          sourceEventId: event.sourceEventId,
        }),
      );
    });
    return () => {
      unsub?.();
    };
  }, [enqueue]);
}
