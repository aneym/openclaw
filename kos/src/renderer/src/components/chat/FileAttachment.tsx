import { FileIcon, Download } from "lucide-react";
import type { FilePart } from "@/types/message";

interface FileAttachmentProps {
  part: FilePart;
}

export function FileAttachment({ part }: FileAttachmentProps) {
  return (
    <a
      href={part.url}
      download={part.filename}
      className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-2 max-w-[85%] hover:border-primary transition-colors no-underline"
    >
      <FileIcon className="size-4 shrink-0 text-muted-foreground" />
      <span className="text-sm text-foreground truncate flex-1 min-w-0">{part.filename}</span>
      <Download className="size-4 shrink-0 text-muted-foreground" />
    </a>
  );
}
