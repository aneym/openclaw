import {
  AlertTriangle,
  ArrowUpRight,
  Clock,
  Folder,
  Globe,
  Loader2,
  Monitor,
  RefreshCw,
  StopCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PanelLayout, PanelLeaf, PanelNode, Thread } from "../../types";
import { useStreaming } from "../../hooks/use-streaming";
import { formatRelativeTime } from "../../lib/time-utils";
import { cn } from "../../lib/utils";
import { useGatewayStore } from "../../stores/gateway-store";
import { usePanelStore } from "../../stores/panel-store";
import { useThreadStore } from "../../stores/thread-store";
import { useWorkspaceStore } from "../../stores/workspace-store";
import { ComposeBar } from "../chat/ComposeBar";
import { useMessages } from "../chat/hooks/useMessages";
import { MessageList } from "../chat/MessageList";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { ScrollArea } from "../ui/scroll-area";

const SESSION_REFRESH_MS = 10000;
const MAX_OPEN_TABS = 6;
const MAX_ERRORS = 6;

interface CodingSession {
  id: string;
  label: string;
  sessionKey?: string;
  runId?: string;
  status?: string;
  phase?: string;
  startedAt?: number;
  updatedAt?: number;
  endedAt?: number;
  worktree?: string;
  workdir?: string;
  provider?: string;
  model?: string;
  error?: string;
}

interface ActiveResource {
  id: string;
  kind: "worktree" | "sim" | "webview";
  label: string;
  detail?: string;
  threadId?: string;
}

interface ErrorEntry {
  id: string;
  title: string;
  detail?: string;
  time?: number;
}

export function HomeDashboard() {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const gatewayConnected = useGatewayStore((s) => s.connected);
  const gatewayError = useGatewayStore((s) => s.error);
  const request = useGatewayStore((s) => s.request);

  const activeThreadId = useThreadStore((s) => s.activeThreadId);
  const setActiveThread = useThreadStore((s) => s.setActiveThread);
  const threadsMap = useThreadStore((s) => s.threads);

  const layoutsMap = usePanelStore((s) => s.layouts);

  const threads = useMemo(() => Array.from(threadsMap.values()), [threadsMap]);
  const layouts = useMemo(() => Array.from(layoutsMap.values()), [layoutsMap]);

  const threadsBySessionKey = useMemo(() => {
    const map = new Map<string, Thread>();
    for (const thread of threads) {
      if (thread.sessionKey) {
        map.set(thread.sessionKey, thread);
      }
    }
    return map;
  }, [threads]);

  const openTabs = useMemo(() => {
    return threads
      .filter((thread) => thread.status !== "archived")
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
      .slice(0, MAX_OPEN_TABS);
  }, [threads]);

  const panelLeaves = useMemo(() => collectPanelLeaves(layouts), [layouts]);

  const panelResources = useMemo(() => {
    return panelLeaves.flatMap((leaf) => {
      if (leaf.panelType !== "preview" && leaf.panelType !== "browser") {
        return [];
      }

      const label = leaf.panelType === "preview" ? "Preview" : "Browser";
      const detail = leaf.panelType === "browser" ? extractUrl(leaf.props) : undefined;

      return [
        {
          id: `${leaf.threadId}-${leaf.panelId}`,
          kind: leaf.panelType === "preview" ? "sim" : "webview",
          label,
          detail,
          threadId: leaf.threadId,
        } as ActiveResource,
      ];
    });
  }, [panelLeaves]);

  const [sessions, setSessions] = useState<CodingSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [sessionsUpdatedAt, setSessionsUpdatedAt] = useState<number | null>(null);
  const [killingIds, setKillingIds] = useState<Set<string>>(new Set());
  const [localErrors, setLocalErrors] = useState<ErrorEntry[]>([]);

  const pushLocalError = useCallback((title: string, detail?: string) => {
    setLocalErrors((prev) => {
      const next = [
        {
          id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          title,
          detail,
          time: Date.now(),
        },
        ...prev,
      ];
      return next.slice(0, MAX_ERRORS);
    });
  }, []);

  const gatewayHttpBase = useMemo(() => {
    const gatewayUrl = activeWorkspace?.gatewayUrl;
    if (!gatewayUrl) {
      return null;
    }
    try {
      const parsed = new URL(gatewayUrl);
      const protocol = parsed.protocol === "wss:" ? "https:" : "http:";
      return `${protocol}//${parsed.host}`;
    } catch {
      return null;
    }
  }, [activeWorkspace?.gatewayUrl]);

  const refreshSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      if (!gatewayHttpBase) {
        throw new Error("Gateway URL not configured");
      }
      const response = await fetch(`${gatewayHttpBase}/api/coding-sessions`, {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as unknown;
      const normalized = normalizeCodingSessions(data);
      setSessions(normalized);
      setSessionsError(null);
      setSessionsUpdatedAt(Date.now());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load sessions";
      setSessionsError(message);
    } finally {
      setSessionsLoading(false);
    }
  }, [gatewayHttpBase]);

  useEffect(() => {
    void refreshSessions();
    const interval = window.setInterval(refreshSessions, SESSION_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [refreshSessions]);

  const handleKillSession = useCallback(
    async (sessionId: string) => {
      setKillingIds((prev) => {
        const next = new Set(prev);
        next.add(sessionId);
        return next;
      });

      try {
        if (!gatewayHttpBase) {
          throw new Error("Gateway URL not configured");
        }
        const response = await fetch(
          `${gatewayHttpBase}/api/coding-sessions/${encodeURIComponent(sessionId)}/kill`,
          {
            method: "POST",
          },
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        await refreshSessions();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to kill session";
        pushLocalError("Failed to stop session", message);
      } finally {
        setKillingIds((prev) => {
          const next = new Set(prev);
          next.delete(sessionId);
          return next;
        });
      }
    },
    [gatewayHttpBase, pushLocalError, refreshSessions],
  );

  const handleAbortRun = useCallback(
    async (sessionKey?: string, runId?: string | null) => {
      if (!sessionKey) {
        return;
      }

      try {
        await request("chat.abort", runId ? { sessionKey, runId } : { sessionKey });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to abort run";
        pushLocalError("Failed to abort chat run", message);
      }
    },
    [request, pushLocalError],
  );

  const activeResources = useMemo(() => {
    const activeSessions = sessions.filter((session) => isSessionActive(session.status));
    const worktrees: ActiveResource[] = activeSessions.flatMap((session) => {
      const worktree = session.worktree ?? session.workdir;
      if (!worktree) {
        return [];
      }

      const threadId = session.sessionKey
        ? threadsBySessionKey.get(session.sessionKey)?.id
        : undefined;

      return [
        {
          id: `worktree-${session.id}`,
          kind: "worktree",
          label: worktree,
          detail: session.label,
          threadId,
        },
      ];
    });

    return [...worktrees, ...panelResources];
  }, [sessions, panelResources, threadsBySessionKey]);

  const runningSessions = useMemo(() => {
    return sessions
      .filter((session) => isSessionActive(session.status))
      .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
  }, [sessions]);

  const routingThreadId = useMemo(
    () => `home-routing-${activeWorkspace?.id ?? "default"}`,
    [activeWorkspace?.id],
  );
  const routingStorageKey = useMemo(
    () => `kos-home-routing-${activeWorkspace?.id ?? "default"}`,
    [activeWorkspace?.id],
  );

  const [routingSessionKey, setRoutingSessionKey] = useState<string | null>(null);
  const [routingError, setRoutingError] = useState<string | null>(null);
  const [routingCreating, setRoutingCreating] = useState(false);

  useEffect(() => {
    setRoutingError(null);
    setRoutingSessionKey(null);
    const stored = localStorage.getItem(routingStorageKey);
    if (stored) {
      setRoutingSessionKey(stored);
    }
  }, [routingStorageKey]);

  useEffect(() => {
    if (routingSessionKey || !gatewayConnected) {
      return;
    }

    const stored = localStorage.getItem(routingStorageKey);
    if (stored) {
      setRoutingSessionKey(stored);
      return;
    }

    let cancelled = false;
    const newKey = generateSessionKey();

    setRoutingCreating(true);
    request("sessions.patch", {
      key: newKey,
      label: "Home: Routing Chat",
    })
      .then(() => {
        if (cancelled) {
          return;
        }
        localStorage.setItem(routingStorageKey, newKey);
        setRoutingSessionKey(newKey);
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        const message = err instanceof Error ? err.message : "Failed to create routing session";
        setRoutingError(message);
      })
      .finally(() => {
        if (cancelled) {
          return;
        }
        setRoutingCreating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [gatewayConnected, request, routingSessionKey, routingStorageKey]);

  const routingSessionSafe = routingSessionKey ?? "";
  const {
    messages,
    loading: routingLoading,
    error: routingMessagesError,
  } = useMessages(routingSessionSafe, routingThreadId);
  const { isStreaming: routingStreaming, runId: routingRunId } = useStreaming(routingSessionSafe);

  const errorEntries = useMemo(() => {
    const entries: ErrorEntry[] = [];

    if (gatewayError) {
      entries.push({
        id: "gateway-error",
        title: "Gateway connection",
        detail: gatewayError,
        time: Date.now(),
      });
    }

    if (sessionsError) {
      entries.push({
        id: "sessions-error",
        title: "Coding sessions",
        detail: sessionsError,
        time: Date.now(),
      });
    }

    if (routingError) {
      entries.push({
        id: "routing-error",
        title: "Routing chat",
        detail: routingError,
        time: Date.now(),
      });
    }

    for (const session of sessions) {
      if (session.error || isSessionError(session.status)) {
        entries.push({
          id: `session-error-${session.id}`,
          title: session.label,
          detail: session.error ?? session.status,
          time: session.endedAt ?? session.updatedAt ?? session.startedAt,
        });
      }
    }

    entries.push(...localErrors);

    return entries.slice(0, MAX_ERRORS);
  }, [gatewayError, sessionsError, routingError, sessions, localErrors]);

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="border-b border-border px-8 py-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <h1 className="text-2xl font-semibold">Home</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {activeWorkspace?.icon ? `${activeWorkspace.icon} ` : ""}
              {activeWorkspace?.name ?? "Default Workspace"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={gatewayConnected ? "secondary" : "destructive"}>
              {gatewayConnected ? "Gateway Connected" : "Gateway Disconnected"}
            </Badge>
            {sessionsUpdatedAt && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>Updated {formatRelativeTime(sessionsUpdatedAt)}</span>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refreshSessions()}
              disabled={sessionsLoading}
              className="gap-2"
            >
              <RefreshCw className={cn("h-4 w-4", sessionsLoading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-8 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>Open Tabs</CardTitle>
                  <CardDescription>Recent threads in this workspace.</CardDescription>
                </div>
                <Badge variant="secondary">{openTabs.length}</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {openTabs.length === 0 ? (
                  <EmptyState
                    title="No open tabs"
                    description="Create a new chat or open a project thread."
                  />
                ) : (
                  <div className="space-y-2">
                    {openTabs.map((thread) => (
                      <OpenTabRow
                        key={thread.id}
                        thread={thread}
                        active={thread.id === activeThreadId}
                        onOpen={() => setActiveThread(thread.id)}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>Running Sessions</CardTitle>
                  <CardDescription>Active CC/Codex runs.</CardDescription>
                </div>
                <Badge variant="secondary">{runningSessions.length}</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {sessionsLoading && runningSessions.length === 0 ? (
                  <LoadingState label="Loading coding sessions..." />
                ) : runningSessions.length === 0 ? (
                  <EmptyState
                    title="No running sessions"
                    description="Start a run to see live status here."
                  />
                ) : (
                  <div className="space-y-3">
                    {runningSessions.map((session) => (
                      <RunningSessionRow
                        key={session.id}
                        session={session}
                        thread={
                          session.sessionKey
                            ? threadsBySessionKey.get(session.sessionKey)
                            : undefined
                        }
                        onOpenThread={(threadId) => setActiveThread(threadId)}
                        onKill={() => void handleKillSession(session.id)}
                        onAbort={(runId) =>
                          void handleAbortRun(session.sessionKey, runId ?? session.runId ?? null)
                        }
                        killing={killingIds.has(session.id)}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>Active Worktrees, Sims & Webviews</CardTitle>
                  <CardDescription>Derived from panels and sessions.</CardDescription>
                </div>
                <Badge variant="secondary">{activeResources.length}</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeResources.length === 0 ? (
                  <EmptyState
                    title="No active resources"
                    description="Open previews or start a coding session."
                  />
                ) : (
                  <div className="space-y-2">
                    {activeResources.map((resource) => (
                      <ResourceRow
                        key={resource.id}
                        resource={resource}
                        threadTitle={
                          resource.threadId ? threadsMap.get(resource.threadId)?.title : undefined
                        }
                        onOpenThread={
                          resource.threadId ? () => setActiveThread(resource.threadId) : undefined
                        }
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>Recent Errors</CardTitle>
                  <CardDescription>Gateway, session, and UI issues.</CardDescription>
                </div>
                <Badge variant={errorEntries.length > 0 ? "destructive" : "secondary"}>
                  {errorEntries.length}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {errorEntries.length === 0 ? (
                  <EmptyState title="All clear" description="No recent errors detected." />
                ) : (
                  <div className="space-y-2">
                    {errorEntries.map((entry, index) => (
                      <div
                        key={`${entry.id}-${index}`}
                        className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2"
                      >
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-destructive">
                              {entry.title}
                            </div>
                            {entry.detail && (
                              <div className="text-xs text-destructive/80 mt-1 break-words">
                                {entry.detail}
                              </div>
                            )}
                          </div>
                          {entry.time && (
                            <div className="text-xs text-destructive/70 whitespace-nowrap">
                              {formatRelativeTime(entry.time)}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="flex flex-col min-h-[520px]">
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>Routing Chat</CardTitle>
                  <CardDescription>Route new work to the right project or thread.</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {routingStreaming && <Badge>Streaming</Badge>}
                  <Badge variant={gatewayConnected ? "secondary" : "destructive"}>
                    {gatewayConnected ? "Online" : "Offline"}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleAbortRun(routingSessionKey, routingRunId)}
                    disabled={!routingSessionKey || !routingStreaming}
                    className="gap-2"
                  >
                    <StopCircle className="h-4 w-4" />
                    Abort
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col overflow-hidden">
                {!gatewayConnected ? (
                  <EmptyState
                    title="Gateway offline"
                    description="Connect to the gateway to start routing conversations."
                  />
                ) : routingCreating ? (
                  <LoadingState label="Starting routing session..." />
                ) : routingSessionKey ? (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {routingMessagesError ? (
                      <div className="flex-1 flex items-center justify-center text-sm text-destructive">
                        {routingMessagesError}
                      </div>
                    ) : routingLoading && messages.length === 0 ? (
                      <div className="flex-1 flex items-center justify-center">
                        <LoadingState label="Loading messages..." />
                      </div>
                    ) : (
                      <MessageList
                        messages={messages}
                        isStreaming={routingStreaming}
                        className="px-0"
                      />
                    )}
                    <ComposeBar
                      sessionKey={routingSessionKey}
                      threadId={routingThreadId}
                      disabled={routingLoading}
                    />
                  </div>
                ) : (
                  <EmptyState
                    title="Routing chat unavailable"
                    description={routingError ?? "Unable to initialize routing session."}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Routing Hints</CardTitle>
                <CardDescription>Use these to steer new work.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <div>1. Mention the project name to route quickly.</div>
                <div>2. Add a Linear issue key to attach the thread.</div>
                <div>3. If unsure, keep the work in Home and ask for guidance.</div>
              </CardContent>
            </Card>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

interface OpenTabRowProps {
  thread: Thread;
  active: boolean;
  onOpen: () => void;
}

function OpenTabRow({ thread, active, onOpen }: OpenTabRowProps) {
  const { isStreaming } = useStreaming(thread.sessionKey);
  const statusDotClass = isStreaming
    ? "bg-blue-500 animate-pulse"
    : active
      ? "bg-emerald-500"
      : "bg-muted-foreground/40";

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2",
        active ? "bg-accent/40" : "bg-background",
      )}
    >
      <div className={cn("h-2.5 w-2.5 rounded-full shrink-0", statusDotClass)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium truncate">{thread.title}</div>
          {isStreaming && <Badge variant="secondary">Streaming</Badge>}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {thread.subtitle ?? "Untitled thread"}
        </div>
      </div>
      <div className="text-xs text-muted-foreground whitespace-nowrap">
        {formatRelativeTime(thread.lastMessageAt)}
      </div>
      <Button variant="ghost" size="xs" onClick={onOpen} className="gap-1">
        Open
        <ArrowUpRight className="h-3 w-3" />
      </Button>
    </div>
  );
}

interface RunningSessionRowProps {
  session: CodingSession;
  thread?: Thread;
  onOpenThread: (threadId: string) => void;
  onKill: () => void;
  onAbort: (runId?: string | null) => void;
  killing: boolean;
}

function RunningSessionRow({
  session,
  thread,
  onOpenThread,
  onKill,
  onAbort,
  killing,
}: RunningSessionRowProps) {
  const { isStreaming, runId } = useStreaming(session.sessionKey ?? "");
  const durationMs = getSessionDuration(session);

  return (
    <div className="rounded-lg border border-border/60 bg-background px-3 py-2 space-y-2">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium truncate">{session.label}</div>
            {session.status && (
              <Badge variant={statusBadgeVariant(session.status)}>{session.status}</Badge>
            )}
            {session.phase && <Badge variant="outline">{session.phase}</Badge>}
            {isStreaming && <Badge>Streaming</Badge>}
          </div>
          <div className="text-xs text-muted-foreground mt-1 space-y-1">
            {session.worktree && <div>Worktree: {session.worktree}</div>}
            {session.model && <div>Model: {session.model}</div>}
            {session.provider && <div>Provider: {session.provider}</div>}
            {durationMs !== null && <div>Duration: {formatDuration(durationMs)}</div>}
          </div>
        </div>
        <div className="flex flex-col gap-2 items-end">
          {thread && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onOpenThread(thread.id)}
              className="gap-1"
            >
              Thread
              <ArrowUpRight className="h-3 w-3" />
            </Button>
          )}
          <Button
            variant="outline"
            size="xs"
            onClick={() => onAbort(runId)}
            disabled={!session.sessionKey || !isStreaming}
            className="gap-1"
          >
            <StopCircle className="h-3 w-3" />
            Abort
          </Button>
          <Button
            variant="destructive"
            size="xs"
            onClick={onKill}
            disabled={killing}
            className="gap-1"
          >
            {killing ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Stop
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ResourceRowProps {
  resource: ActiveResource;
  threadTitle?: string;
  onOpenThread?: () => void;
}

function ResourceRow({ resource, threadTitle, onOpenThread }: ResourceRowProps) {
  const icon =
    resource.kind === "worktree" ? (
      <Folder className="h-4 w-4 text-muted-foreground" />
    ) : resource.kind === "sim" ? (
      <Monitor className="h-4 w-4 text-muted-foreground" />
    ) : (
      <Globe className="h-4 w-4 text-muted-foreground" />
    );

  const label =
    resource.kind === "worktree" ? "Worktree" : resource.kind === "sim" ? "Sim" : "Webview";

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-background px-3 py-2">
      {icon}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium truncate">{resource.label}</div>
          <Badge variant="outline">{label}</Badge>
        </div>
        {resource.detail && (
          <div className="text-xs text-muted-foreground truncate">{resource.detail}</div>
        )}
        {threadTitle && (
          <div className="text-xs text-muted-foreground truncate">Thread: {threadTitle}</div>
        )}
      </div>
      {onOpenThread && (
        <Button variant="ghost" size="xs" onClick={onOpenThread} className="gap-1">
          Open
          <ArrowUpRight className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
      <div className="font-medium text-foreground/80">{title}</div>
      <div className="text-xs mt-1">{description}</div>
    </div>
  );
}

function generateSessionKey(): string {
  return `kos-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeCodingSessions(data: unknown): CodingSession[] {
  const items = extractSessionArray(data);

  return items.flatMap((item, index) => {
    if (!isRecord(item)) {
      return [];
    }

    const id =
      coerceString(item.id) ??
      coerceString(item.sessionId) ??
      coerceString(item.session_id) ??
      coerceString(item.key) ??
      `session-${index}`;

    const sessionKey =
      coerceString(item.sessionKey) ??
      coerceString(item.session_key) ??
      coerceString(item.key) ??
      coerceString(getNestedValue(item, ["metadata", "sessionKey"])) ??
      coerceString(getNestedValue(item, ["metadata", "session_key"]));

    const label =
      coerceString(item.label) ??
      coerceString(item.name) ??
      coerceString(item.title) ??
      coerceString(item.task) ??
      sessionKey ??
      id;

    const status =
      coerceString(item.status) ??
      coerceString(item.state) ??
      coerceString(item.phase) ??
      coerceString(item.lifecycle) ??
      coerceString(getNestedValue(item, ["metadata", "status"]));

    const phase =
      coerceString(item.phase) ??
      coerceString(item.stage) ??
      coerceString(getNestedValue(item, ["metadata", "phase"]));

    const startedAt =
      parseTimestamp(item.startedAt) ??
      parseTimestamp(item.startTime) ??
      parseTimestamp(item.createdAt) ??
      parseTimestamp(item.created_at) ??
      parseTimestamp(getNestedValue(item, ["metadata", "startedAt"]));

    const updatedAt =
      parseTimestamp(item.updatedAt) ??
      parseTimestamp(item.updated_at) ??
      parseTimestamp(item.lastUpdated) ??
      parseTimestamp(getNestedValue(item, ["metadata", "updatedAt"]));

    const endedAt =
      parseTimestamp(item.endedAt) ??
      parseTimestamp(item.completedAt) ??
      parseTimestamp(item.finishedAt) ??
      parseTimestamp(getNestedValue(item, ["metadata", "endedAt"]));

    const worktree =
      coerceString(item.worktree) ??
      coerceString(item.worktreePath) ??
      coerceString(item.worktree_path) ??
      coerceString(item.workspacePath) ??
      coerceString(item.workspace_path) ??
      coerceString(getNestedValue(item, ["metadata", "worktree"])) ??
      coerceString(getNestedValue(item, ["context", "worktree"]));

    const workdir =
      coerceString(item.workdir) ??
      coerceString(item.cwd) ??
      coerceString(item.workingDirectory) ??
      coerceString(item.repoPath) ??
      coerceString(getNestedValue(item, ["metadata", "workdir"]));

    const provider =
      coerceString(item.provider) ??
      coerceString(item.engine) ??
      coerceString(item.source) ??
      coerceString(getNestedValue(item, ["metadata", "provider"]));

    const model =
      coerceString(item.model) ??
      coerceString(item.modelName) ??
      coerceString(getNestedValue(item, ["metadata", "model"]));

    const error =
      coerceString(item.error) ??
      coerceString(item.errorMessage) ??
      coerceString(item.lastError) ??
      coerceString(getNestedValue(item, ["metadata", "error"]));

    return [
      {
        id,
        label,
        sessionKey: sessionKey ?? undefined,
        runId: coerceString(item.runId) ?? coerceString(item.run_id),
        status: status ?? undefined,
        phase: phase ?? undefined,
        startedAt: startedAt ?? undefined,
        updatedAt: updatedAt ?? undefined,
        endedAt: endedAt ?? undefined,
        worktree: worktree ?? undefined,
        workdir: workdir ?? undefined,
        provider: provider ?? undefined,
        model: model ?? undefined,
        error: error ?? undefined,
      },
    ];
  });
}

function extractSessionArray(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }

  if (isRecord(data)) {
    const direct =
      data.sessions ?? data.items ?? data.results ?? data.data ?? data.codingSessions ?? data.runs;

    if (Array.isArray(direct)) {
      return direct;
    }

    if (isRecord(direct)) {
      const nested =
        direct.sessions ?? direct.items ?? direct.results ?? direct.data ?? direct.codingSessions;
      if (Array.isArray(nested)) {
        return nested;
      }
    }
  }

  return [];
}

function collectPanelLeaves(layouts: PanelLayout[]): Array<PanelLeaf & { threadId: string }> {
  const leaves: Array<PanelLeaf & { threadId: string }> = [];

  for (const layout of layouts) {
    const queue: PanelNode[] = [layout.root];

    while (queue.length > 0) {
      const node = queue.shift();
      if (!node) {
        continue;
      }

      if (node.type === "leaf") {
        leaves.push({ ...node, threadId: layout.threadId });
      } else {
        queue.push(node.children[0], node.children[1]);
      }
    }
  }

  return leaves;
}

function extractUrl(props?: Record<string, unknown>): string | undefined {
  if (!props) {
    return undefined;
  }

  const raw = props.url;
  if (typeof raw === "string" && raw.trim()) {
    return raw;
  }

  return undefined;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function getSessionDuration(session: CodingSession): number | null {
  const start = session.startedAt;
  if (!start) {
    return null;
  }

  const end = session.endedAt ?? Date.now();
  return Math.max(0, end - start);
}

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (isSessionError(status)) {
    return "destructive";
  }

  if (/running|active|streaming|in progress|working/i.test(status)) {
    return "default";
  }

  return "secondary";
}

function isSessionActive(status?: string): boolean {
  if (!status) {
    return true;
  }
  return !/completed|complete|stopped|killed|finished|failed|error|aborted/i.test(status);
}

function isSessionError(status?: string): boolean {
  if (!status) {
    return false;
  }
  return /error|failed|crash|panic/i.test(status);
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return numeric < 1e12 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return null;
}

function coerceString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getNestedValue(obj: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (!isRecord(current) || !(key in current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}
