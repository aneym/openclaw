import { FileText, X, Eye, Code2 } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Streamdown } from "streamdown";
import { cn } from "../../lib/utils";
import { useArtifactStore, type ArtifactFile } from "../../stores/artifact-store";
import { useGatewayStore } from "../../stores/gateway-store";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

/** Extract basename from a file path */
function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

/** Get a short directory hint (last 2 parent dirs) */
function dirHint(path: string): string {
  const parts = path.split("/");
  if (parts.length <= 2) {
    return "";
  }
  return parts.slice(-3, -1).join("/");
}

interface AgentEventPayload {
  stream: string;
  data: Record<string, unknown>;
}

export function ArtifactPanel() {
  const filesMap = useArtifactStore((s) => s.files);
  const activeFilePath = useArtifactStore((s) => s.activeFilePath);
  const setActiveFile = useArtifactStore((s) => s.setActiveFile);
  const removeFile = useArtifactStore((s) => s.removeFile);

  const files = useMemo(() => [...filesMap.values()], [filesMap]);
  const activeFile = useMemo(
    () => (activeFilePath ? filesMap.get(activeFilePath) : undefined),
    [filesMap, activeFilePath],
  );

  // Subscribe to agent tool events (Write/Edit) to auto-add files
  const subscribe = useGatewayStore((s) => s.subscribe);

  useEffect(() => {
    const unsubscribe = subscribe("agent", (payload: unknown) => {
      const event = payload as AgentEventPayload;
      if (event.stream !== "tool") {
        return;
      }

      const toolName = event.data?.toolName as string | undefined;
      if (!toolName) {
        return;
      }

      // Zustand store methods are stable — safe to call directly
      const { addFile: add, updateFile: update } = useArtifactStore.getState();

      if (toolName === "Write") {
        const filePath = event.data?.filePath as string | undefined;
        const content = event.data?.content as string | undefined;
        if (filePath && content != null) {
          add(filePath, content);
        }
      } else if (toolName === "Edit") {
        const filePath = event.data?.filePath as string | undefined;
        const content = event.data?.newContent as string | undefined;
        if (filePath && content != null) {
          update(filePath, content);
        }
      }
    });
    return unsubscribe;
  }, [subscribe]);

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground gap-2">
        <FileText className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm">No artifacts yet</p>
        <p className="text-xs text-muted-foreground/60">
          Files will appear here when the agent uses Write or Edit
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="shrink-0 flex items-center gap-0.5 px-1 py-1 border-b bg-muted/30 overflow-x-auto">
        {files.map((file) => (
          <FileTab
            key={file.path}
            file={file}
            isActive={file.path === activeFilePath}
            onSelect={() => setActiveFile(file.path)}
            onClose={() => removeFile(file.path)}
          />
        ))}
      </div>

      {/* File content */}
      {activeFile ? (
        <FileViewer key={activeFile.path} file={activeFile} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Select a file tab
        </div>
      )}
    </div>
  );
}

/** Tab for a single file in the artifact panel */
const FileTab = memo(function FileTab({
  file,
  isActive,
  onSelect,
  onClose,
}: {
  file: ArtifactFile;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const name = basename(file.path);
  const dir = dirHint(file.path);

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClose();
    },
    [onClose],
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "group flex items-center gap-1 px-2 py-1 rounded-md cursor-pointer transition-colors min-w-0 max-w-[180px]",
            isActive ? "bg-background shadow-sm" : "hover:bg-muted/50",
          )}
          onClick={onSelect}
        >
          <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="text-xs truncate">{name}</span>
          <button
            className="ml-auto shrink-0 opacity-0 group-hover:opacity-100 hover:bg-muted rounded p-0.5 transition-opacity"
            onClick={handleClose}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        <div>{file.path}</div>
        {dir && <div className="text-muted-foreground">{dir}</div>}
      </TooltipContent>
    </Tooltip>
  );
});

/** File content viewer with markdown preview toggle.
 * Keyed by file.path in the parent to reset state when switching files. */
function FileViewer({ file }: { file: ArtifactFile }) {
  const isMarkdown = file.language === "markdown";
  const [showPreview, setShowPreview] = useState(isMarkdown);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center justify-between px-3 py-1 border-b bg-background">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-muted-foreground truncate">{file.path}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {file.language}
          </span>
        </div>
        {isMarkdown && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs gap-1"
            onClick={() => setShowPreview((p) => !p)}
          >
            {showPreview ? (
              <>
                <Code2 className="h-3 w-3" />
                Source
              </>
            ) : (
              <>
                <Eye className="h-3 w-3" />
                Preview
              </>
            )}
          </Button>
        )}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        {isMarkdown && showPreview ? (
          <div className="p-4">
            <Streamdown
              className="size-full break-words overflow-hidden [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_code]:whitespace-pre-wrap [&_code]:break-words [&_pre]:max-w-full [&_pre]:overflow-x-auto"
              controls={{ code: true }}
            >
              {file.content}
            </Streamdown>
          </div>
        ) : (
          <pre className="p-4 text-xs font-mono leading-relaxed whitespace-pre-wrap break-words text-foreground">
            <code>{addLineNumbers(file.content)}</code>
          </pre>
        )}
      </ScrollArea>
    </div>
  );
}

/** Add line numbers to content */
function addLineNumbers(content: string): React.ReactNode {
  const lines = content.split("\n");
  const gutterWidth = String(lines.length).length;

  return lines.map((line, i) => (
    <span key={i} className="table-row">
      <span
        className="table-cell pr-4 text-right text-muted-foreground/40 select-none"
        style={{ minWidth: `${gutterWidth + 1}ch` }}
      >
        {i + 1}
      </span>
      <span className="table-cell">{line || "\n"}</span>
    </span>
  ));
}
