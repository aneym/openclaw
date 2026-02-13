import { ChevronDown, Check } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sessionKeysMatch } from "@/lib/session-keys";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/stores/gateway-store";

interface ModelInfo {
  id: string;
  name?: string;
}

interface ModelSelectorProps {
  sessionKey: string;
  className?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

export function ModelSelector({ sessionKey, className }: ModelSelectorProps) {
  const request = useGatewayStore((s) => s.request);
  const connected = useGatewayStore((s) => s.connected);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [currentModel, setCurrentModel] = useState<string | null>(null);

  // Fetch available models on mount
  useEffect(() => {
    if (!connected) {
      return;
    }
    void request<{ models: ModelInfo[] }>("models.list")
      .then((res) => {
        if (res?.models) {
          setModels(res.models);
        }
      })
      .catch(() => {
        // Gateway may not support models.list
      });
  }, [connected, request]);

  // Get current session model
  useEffect(() => {
    if (!connected || !sessionKey) {
      return;
    }
    let cancelled = false;

    // Gateway does not expose a "sessions.get" method; use sessions.list rows instead.
    void request<{ sessions?: unknown[] }>("sessions.list", { limit: 25, search: sessionKey })
      .then((res) => {
        if (cancelled) {
          return;
        }
        const sessions = Array.isArray(res?.sessions) ? res.sessions : [];

        const match = sessions.find((row) => {
          if (!isRecord(row)) {
            return false;
          }
          const key = readString(row.key);
          return key ? sessionKeysMatch(key, sessionKey) : false;
        });

        const model = match && isRecord(match) ? readString(match.model) : undefined;
        if (model) {
          setCurrentModel(model);
        }
      })
      .catch(() => {
        // Session may not expose model
      });

    return () => {
      cancelled = true;
    };
  }, [connected, sessionKey, request]);

  const handleSelectModel = useCallback(
    async (modelId: string) => {
      try {
        await request("sessions.patch", { key: sessionKey, model: modelId });
        setCurrentModel(modelId);
      } catch {
        // Failed to patch session
      }
    },
    [request, sessionKey],
  );

  if (models.length === 0) {
    return null;
  }

  const displayModel = currentModel
    ? (models.find((m) => m.id === currentModel)?.name ?? currentModel.split("/").pop())
    : "Model";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground",
          "transition-colors px-2 py-1 rounded-md hover:bg-muted/50",
          className,
        )}
      >
        <span className="truncate max-w-[120px]">{displayModel}</span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-60 overflow-y-auto">
        {models.map((model) => (
          <DropdownMenuItem
            key={model.id}
            onClick={() => void handleSelectModel(model.id)}
            className="flex items-center justify-between gap-2"
          >
            <span className="truncate">{model.name ?? model.id}</span>
            {currentModel === model.id && <Check className="h-3.5 w-3.5 shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
