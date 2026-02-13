import {
  GitBranch,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Plus,
  Minus,
  FileText,
  Trash2,
  Check,
  AlertCircle,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "../../lib/utils";
import { useGitStore, type GitFile } from "../../stores/git-store";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

const STATUS_COLORS: Record<GitFile["status"], string> = {
  modified: "text-yellow-500",
  added: "text-green-500",
  deleted: "text-red-500",
  renamed: "text-blue-500",
  untracked: "text-muted-foreground",
};

const STATUS_LABELS: Record<GitFile["status"], string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  renamed: "R",
  untracked: "?",
};

export function GitPanel() {
  const files = useGitStore((s) => s.files);
  const branch = useGitStore((s) => s.branch);
  const loading = useGitStore((s) => s.loading);
  const error = useGitStore((s) => s.error);
  const diff = useGitStore((s) => s.diff);
  const selectedFile = useGitStore((s) => s.selectedFile);
  const commitMessage = useGitStore((s) => s.commitMessage);
  const refresh = useGitStore((s) => s.refresh);
  const stage = useGitStore((s) => s.stage);
  const unstage = useGitStore((s) => s.unstage);
  const stageAll = useGitStore((s) => s.stageAll);
  const unstageAll = useGitStore((s) => s.unstageAll);
  const commit = useGitStore((s) => s.commit);
  const discard = useGitStore((s) => s.discard);
  const setSelectedFile = useGitStore((s) => s.setSelectedFile);
  const setCommitMessage = useGitStore((s) => s.setCommitMessage);
  const viewDiff = useGitStore((s) => s.viewDiff);

  // Section collapse state
  const [stagedOpen, setStagedOpen] = useState(true);
  const [unstagedOpen, setUnstagedOpen] = useState(true);

  // Refresh on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  const stagedFiles = useMemo(() => files.filter((f) => f.staged), [files]);
  const unstagedFiles = useMemo(() => files.filter((f) => !f.staged), [files]);

  const handleCommit = useCallback(() => {
    if (commitMessage.trim() && stagedFiles.length > 0) {
      commit(commitMessage);
    }
  }, [commit, commitMessage, stagedFiles.length]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && e.metaKey) {
        e.preventDefault();
        handleCommit();
      }
    },
    [handleCommit],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">{branch || "No branch"}</span>
          {files.length > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
              {files.length}
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-destructive/10 border-b border-destructive/20 text-destructive text-xs">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-h-0">
        {selectedFile && diff != null ? (
          <DiffViewer path={selectedFile} diff={diff} onClose={() => setSelectedFile(null)} />
        ) : (
          <ScrollArea className="flex-1">
            <div className="py-1">
              {/* Staged section */}
              <FileSection
                title="Staged Changes"
                files={stagedFiles}
                isOpen={stagedOpen}
                onToggle={() => setStagedOpen((p) => !p)}
                onToggleFile={(path) => unstage(path)}
                onSelectFile={viewDiff}
                selectedFile={selectedFile}
                staged
                onBulkAction={unstageAll}
                bulkLabel="Unstage All"
              />

              {/* Unstaged section */}
              <FileSection
                title="Changes"
                files={unstagedFiles}
                isOpen={unstagedOpen}
                onToggle={() => setUnstagedOpen((p) => !p)}
                onToggleFile={(path) => stage(path)}
                onSelectFile={viewDiff}
                selectedFile={selectedFile}
                staged={false}
                onBulkAction={stageAll}
                bulkLabel="Stage All"
                onDiscard={discard}
              />

              {files.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <Check className="h-6 w-6 text-green-500/60" />
                  <p className="text-xs">Working tree clean</p>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Commit area */}
      <div className="shrink-0 border-t px-3 py-2 bg-background space-y-2">
        <Input
          placeholder="Commit message"
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-8 text-xs"
        />
        <Button
          size="sm"
          className="w-full h-7 text-xs"
          disabled={!commitMessage.trim() || stagedFiles.length === 0}
          onClick={handleCommit}
        >
          <Check className="h-3 w-3 mr-1" />
          Commit ({stagedFiles.length} file{stagedFiles.length !== 1 ? "s" : ""})
        </Button>
      </div>
    </div>
  );
}

/** Collapsible section for staged/unstaged files */
function FileSection({
  title,
  files,
  isOpen,
  onToggle,
  onToggleFile,
  onSelectFile,
  selectedFile,
  staged,
  onBulkAction,
  bulkLabel,
  onDiscard,
}: {
  title: string;
  files: GitFile[];
  isOpen: boolean;
  onToggle: () => void;
  onToggleFile: (path: string) => void;
  onSelectFile: (path: string) => void;
  selectedFile: string | null;
  staged: boolean;
  onBulkAction: () => void;
  bulkLabel: string;
  onDiscard?: (path: string) => void;
}) {
  if (files.length === 0) {
    return null;
  }

  return (
    <div>
      {/* Section header */}
      <div
        className="flex items-center justify-between px-3 py-1 cursor-pointer hover:bg-muted/50"
        onClick={onToggle}
      >
        <div className="flex items-center gap-1">
          {isOpen ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
          <span className="text-xs font-medium">{title}</span>
          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 ml-1">
            {files.length}
          </Badge>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-5 px-1.5 text-[10px]"
          onClick={(e) => {
            e.stopPropagation();
            onBulkAction();
          }}
        >
          {staged ? <Minus className="h-3 w-3 mr-0.5" /> : <Plus className="h-3 w-3 mr-0.5" />}
          {bulkLabel}
        </Button>
      </div>

      {/* File list */}
      {isOpen && (
        <div>
          {files.map((file) => (
            <GitFileRow
              key={file.path}
              file={file}
              isSelected={file.path === selectedFile}
              onToggle={() => onToggleFile(file.path)}
              onSelect={() => onSelectFile(file.path)}
              onDiscard={onDiscard ? () => onDiscard(file.path) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Single file row in the git panel */
const GitFileRow = memo(function GitFileRow({
  file,
  isSelected,
  onToggle,
  onSelect,
  onDiscard,
}: {
  file: GitFile;
  isSelected: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onDiscard?: () => void;
}) {
  const name = file.path.split("/").pop() ?? file.path;
  const dir = file.path.includes("/") ? file.path.substring(0, file.path.lastIndexOf("/")) : "";

  return (
    <div
      className={cn(
        "group flex items-center gap-2 px-3 py-0.5 cursor-pointer transition-colors",
        isSelected ? "bg-accent" : "hover:bg-muted/50",
      )}
      onClick={onSelect}
    >
      <Checkbox
        checked={file.staged}
        onCheckedChange={() => onToggle()}
        onClick={(e) => e.stopPropagation()}
        className="h-3.5 w-3.5"
      />
      <span className={cn("text-[10px] font-mono w-3 shrink-0", STATUS_COLORS[file.status])}>
        {STATUS_LABELS[file.status]}
      </span>
      <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-xs truncate flex-1">{name}</span>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          {file.path}
        </TooltipContent>
      </Tooltip>
      {dir && (
        <span className="text-[10px] text-muted-foreground/60 truncate max-w-[120px]">{dir}</span>
      )}
      {onDiscard && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="shrink-0 opacity-0 group-hover:opacity-100 hover:text-destructive p-0.5 rounded transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                onDiscard();
              }}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            Discard changes
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
});

/** Inline diff viewer */
function DiffViewer({ path, diff, onClose }: { path: string; diff: string; onClose: () => void }) {
  const lines = useMemo(() => diff.split("\n"), [diff]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Diff header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-1 border-b bg-muted/30">
        <span className="text-xs font-mono truncate">{path}</span>
        <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px]" onClick={onClose}>
          Close
        </Button>
      </div>

      {/* Diff content */}
      <ScrollArea className="flex-1">
        <pre className="p-2 text-xs font-mono leading-relaxed">
          {lines.map((line, i) => (
            <DiffLine key={i} line={line} />
          ))}
        </pre>
      </ScrollArea>
    </div>
  );
}

/** Single diff line with +/- coloring */
function DiffLine({ line }: { line: string }) {
  let className = "";
  if (line.startsWith("+") && !line.startsWith("+++")) {
    className = "bg-green-500/10 text-green-700 dark:text-green-400";
  } else if (line.startsWith("-") && !line.startsWith("---")) {
    className = "bg-red-500/10 text-red-700 dark:text-red-400";
  } else if (line.startsWith("@@")) {
    className = "text-blue-500 bg-blue-500/5";
  } else if (line.startsWith("diff") || line.startsWith("index")) {
    className = "text-muted-foreground font-medium";
  }

  return (
    <div className={cn("px-2 whitespace-pre-wrap break-words", className)}>{line || "\n"}</div>
  );
}
