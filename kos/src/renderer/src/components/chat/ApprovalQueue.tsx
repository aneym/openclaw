import { ShieldAlert, Wrench, Check, X } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { resolveExecApproval, resolveToolApproval } from "../../hooks/use-approval-sync";
import {
  useGatewayStore,
  type ExecApprovalRequest,
  type ToolApprovalRequest,
} from "../../stores/gateway-store";
import { Button } from "../ui/button";

// ── Unified approval item ────────────────────────────────────────

type ApprovalItem =
  | { kind: "exec"; entry: ExecApprovalRequest }
  | { kind: "tool"; entry: ToolApprovalRequest };

function getApprovalId(item: ApprovalItem): string {
  return item.entry.id;
}

function getApprovalDescription(item: ApprovalItem): string {
  if (item.kind === "exec") {
    return item.entry.request.command;
  }
  return `${item.entry.request.toolName}(${JSON.stringify(item.entry.request.toolInput).slice(0, 100)})`;
}

function getApprovalSessionKey(item: ApprovalItem): string | null {
  return item.entry.request.sessionKey ?? null;
}

// ── Single approval card ─────────────────────────────────────────

interface ApprovalCardProps {
  item: ApprovalItem;
}

const ApprovalCard = memo(function ApprovalCard({ item }: ApprovalCardProps) {
  const [resolving, setResolving] = useState(false);
  const isExec = item.kind === "exec";
  const description = getApprovalDescription(item);
  const sessionKey = getApprovalSessionKey(item);
  const expiresIn = Math.max(0, Math.round((item.entry.expiresAtMs - Date.now()) / 1000));

  const handleApprove = useCallback(async () => {
    setResolving(true);
    if (item.kind === "exec") {
      await resolveExecApproval(item.entry.id, "allow");
    } else {
      await resolveToolApproval(item.entry.id, "allow");
    }
  }, [item]);

  const handleDeny = useCallback(async () => {
    setResolving(true);
    if (item.kind === "exec") {
      await resolveExecApproval(item.entry.id, "deny");
    } else {
      await resolveToolApproval(item.entry.id, "deny");
    }
  }, [item]);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="flex items-start gap-2">
        {isExec ? (
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        ) : (
          <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground/80">
            {isExec ? "Command Approval" : "Tool Approval"}
          </p>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-xs text-foreground/70 font-mono">
            {description}
          </pre>
          <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
            {sessionKey && <span>session: {sessionKey.slice(0, 30)}</span>}
            <span>{expiresIn}s remaining</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
          onClick={handleDeny}
          disabled={resolving}
        >
          <X className="mr-1 h-3 w-3" />
          Deny
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-green-600 hover:text-green-600"
          onClick={handleApprove}
          disabled={resolving}
        >
          <Check className="mr-1 h-3 w-3" />
          Allow
        </Button>
      </div>
    </div>
  );
});

// ── Approval queue container ─────────────────────────────────────

interface ApprovalQueueProps {
  /** Filter approvals to a specific session key (optional) */
  sessionKey?: string;
}

export function ApprovalQueue({ sessionKey }: ApprovalQueueProps) {
  const execQueue = useGatewayStore((s) => s.execApprovalQueue);
  const toolQueue = useGatewayStore((s) => s.toolApprovalQueue);

  const items = useMemo(() => {
    const all: ApprovalItem[] = [
      ...execQueue.map((e) => ({ kind: "exec" as const, entry: e })),
      ...toolQueue.map((e) => ({ kind: "tool" as const, entry: e })),
    ];

    // Filter by session key if provided
    const filtered = sessionKey
      ? all.filter((item) => getApprovalSessionKey(item) === sessionKey)
      : all;

    // Sort by creation time (oldest first)
    return filtered.toSorted((a, b) => a.entry.createdAtMs - b.entry.createdAtMs);
  }, [execQueue, toolQueue, sessionKey]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 px-3 py-2">
      {items.map((item) => (
        <ApprovalCard key={getApprovalId(item)} item={item} />
      ))}
    </div>
  );
}
