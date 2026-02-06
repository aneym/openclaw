import { Send, Square, X, ImageIcon } from "lucide-react";
import { useState, useRef, useEffect, KeyboardEvent, ClipboardEvent, DragEvent } from "react";
import { flushSync } from "react-dom";
import type { QueuedMessage } from "../../stores/chat-session-store";
import { useGatewayConnected } from "../../gateway/hooks";
import { useAutoResizeTextarea } from "../../hooks/use-auto-resize-textarea";
import { useImageAttachments } from "../../hooks/use-image-attachments";
import { klog } from "../../lib/klog";
import { cn } from "../../lib/utils";
import { MessageQueue } from "./MessageQueue";

interface ComposeBarProps {
  sessionKey: string;
  chatId: string;
  isStreaming: boolean;
  awaitingResponse: boolean;
  autoFocus?: boolean;
  queue: QueuedMessage[];
  onSend: (text: string, attachments?: unknown[]) => Promise<void>;
  onSendNow: (text: string, attachments?: unknown[]) => Promise<void>;
  onAbort: () => Promise<void>;
  onRemoveFromQueue: (messageId: string) => void;
}

export function ComposeBar({
  sessionKey,
  chatId,
  isStreaming,
  awaitingResponse,
  autoFocus = false,
  queue,
  onSend,
  onSendNow,
  onAbort,
  onRemoveFromQueue,
}: ComposeBarProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus on mount when requested
  useEffect(() => {
    if (!autoFocus) return;
    // Small delay to ensure panel animation completes
    const timer = setTimeout(() => {
      textareaRef.current?.focus();
    }, 250);
    return () => clearTimeout(timer);
  }, [autoFocus]);

  // Gateway connection state
  const connected = useGatewayConnected();
  const { images, addImage, removeImage, clearImages } = useImageAttachments();

  // Auto-resize textarea based on content
  useAutoResizeTextarea(textareaRef, text);

  // Drag-and-drop state
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  // Handle drag events for image drop
  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer?.types.includes("Files")) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    // Process all dropped image files
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith("image/")) {
        await addImage(file);
      }
    }
  };

  // Handle clipboard paste for images
  const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageItems: DataTransferItem[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        imageItems.push(items[i]);
      }
    }

    if (imageItems.length === 0) return;

    e.preventDefault();

    // Process all pasted images
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (file) {
        await addImage(file);
      }
    }
  };

  const canSend = connected && (text.trim().length > 0 || images.length > 0);

  const handleSend = async (immediate = false) => {
    if (!canSend) return;

    const messageText = text.trim();
    const currentImages = [...images];
    setText("");
    clearImages();

    klog.compose("handleSend called", {
      sessionKey,
      chatId,
      textLength: messageText.length,
      immediate,
      isStreaming,
    });

    // Build attachments from images
    const attachments =
      currentImages.length > 0 ? currentImages.map((img) => ({ dataUrl: img.dataUrl })) : undefined;

    if (immediate) {
      // Send immediately (will abort if streaming)
      await onSendNow(messageText, attachments);
    } else {
      // Normal send (will queue if streaming)
      await onSend(messageText, attachments);
    }
  };

  const handleSendQueuedNow = async () => {
    // Abort current run and send the first queued message
    if (queue.length === 0) return;

    const firstMessage = queue[0];
    onRemoveFromQueue(firstMessage.id);

    klog.compose("handleSendQueuedNow", { id: firstMessage.id });

    // Send immediately (will abort first)
    await onSendNow(firstMessage.text, firstMessage.attachments);
  };

  const handleAbort = async () => {
    if (!isStreaming && !awaitingResponse) return;

    klog.compose("handleAbort called", { sessionKey, connected });
    await onAbort();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = textareaRef.current;

    // Cmd+Backspace: delete to beginning of line
    if (e.key === "Backspace" && e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey && ta) {
      e.preventDefault();
      const start = ta.selectionStart;
      const lineStart = text.lastIndexOf("\n", start - 1) + 1;
      if (start > lineStart) {
        flushSync(() => setText(text.slice(0, lineStart) + text.slice(start)));
        ta.setSelectionRange(lineStart, lineStart);
      }
      return;
    }

    // Cmd+Delete (Fn+Backspace): delete to end of line
    if (e.key === "Delete" && e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey && ta) {
      e.preventDefault();
      const end = ta.selectionEnd;
      const nextNl = text.indexOf("\n", end);
      const lineEnd = nextNl === -1 ? text.length : nextNl;
      if (end < lineEnd) {
        flushSync(() => setText(text.slice(0, end) + text.slice(lineEnd)));
        ta.setSelectionRange(end, end);
      }
      return;
    }

    // Option+Backspace: delete previous word
    if (e.key === "Backspace" && e.altKey && !e.metaKey && !e.ctrlKey && ta) {
      e.preventDefault();
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      if (start !== end) {
        flushSync(() => setText(text.slice(0, start) + text.slice(end)));
        ta.setSelectionRange(start, start);
      } else if (start > 0) {
        // Walk backward: skip trailing spaces, then skip word chars
        let i = start;
        while (i > 0 && /\s/.test(text[i - 1])) i--;
        while (i > 0 && /\S/.test(text[i - 1])) i--;
        flushSync(() => setText(text.slice(0, i) + text.slice(start)));
        ta.setSelectionRange(i, i);
      }
      return;
    }

    // Option+Delete (Fn+Backspace): delete next word
    if (e.key === "Delete" && e.altKey && !e.metaKey && !e.ctrlKey && ta) {
      e.preventDefault();
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      if (start !== end) {
        flushSync(() => setText(text.slice(0, start) + text.slice(end)));
        ta.setSelectionRange(start, start);
      } else if (end < text.length) {
        let i = end;
        while (i < text.length && /\S/.test(text[i])) i++;
        while (i < text.length && /\s/.test(text[i])) i++;
        flushSync(() => setText(text.slice(0, end) + text.slice(i)));
        ta.setSelectionRange(end, end);
      }
      return;
    }

    // Enter = send (unless Shift is held)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
    // Cmd+Shift+Enter = send immediately (abort + send)
    if (e.key === "Enter" && e.metaKey && e.shiftKey) {
      e.preventDefault();
      void handleSend(true);
    }
  };

  return (
    <>
      <MessageQueue queue={queue} onSendNow={handleSendQueuedNow} onRemove={onRemoveFromQueue} />
      <div
        className="relative border-t border-border bg-background px-4 py-3"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Drop zone overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-50 flex items-center justify-center rounded-md border-2 border-dashed border-primary bg-primary/10 backdrop-blur-[2px]">
            <div className="flex flex-col items-center gap-2 text-primary">
              <ImageIcon className="h-8 w-8" />
              <span className="text-sm font-medium">Drop images here</span>
            </div>
          </div>
        )}
        <div className="max-w-2xl mx-auto w-full space-y-2">
          {/* Image preview thumbnails */}
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {images.map((img) => (
                <div
                  key={img.id}
                  className="group relative h-20 w-20 overflow-hidden rounded-md border border-border"
                >
                  <img src={img.dataUrl} alt="" className="h-full w-full object-cover" />
                  <button
                    onClick={() => removeImage(img.id)}
                    className={cn(
                      "absolute right-1 top-1 rounded-full bg-background/80 p-1",
                      "opacity-0 transition-opacity group-hover:opacity-100",
                      "hover:bg-background",
                    )}
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-background/80 px-1 py-0.5 text-[10px] text-muted-foreground">
                    {Math.round(img.size / 1024)}KB
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Text input */}
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                !connected
                  ? "Disconnected..."
                  : isStreaming
                    ? "Message will be queued..."
                    : "Type a message..."
              }
              disabled={!connected}
              rows={1}
              className={cn(
                "flex-1 resize-none rounded-md border border-input bg-background px-3 py-2",
                "text-sm placeholder:text-muted-foreground",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "min-h-[40px] max-h-[200px]",
              )}
            />
            {isStreaming || awaitingResponse ? (
              <button
                onClick={() => handleAbort()}
                className={cn(
                  "inline-flex h-10 items-center justify-center rounded-md px-4",
                  "text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                )}
                title="Stop generating (⌘⇧Enter)"
              >
                <Square className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={() => handleSend()}
                disabled={!canSend}
                className={cn(
                  "inline-flex h-10 items-center justify-center rounded-md px-4",
                  "text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  "disabled:pointer-events-none disabled:opacity-50",
                  canSend
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
