import { Send, Square, X, ImageIcon } from "lucide-react";
import { useState, useRef, KeyboardEvent, ClipboardEvent, DragEvent } from "react";
import type { ChatMessage } from "../../types/message";
import { useGatewayConnected, useGatewayRequest } from "../../gateway/hooks";
import { useAutoResizeTextarea } from "../../hooks/use-auto-resize-textarea";
import { useImageAttachments } from "../../hooks/use-image-attachments";
import { useStreaming } from "../../hooks/use-streaming";
import { klog } from "../../lib/klog";
import { notifications } from "../../lib/notifications";
import { cn } from "../../lib/utils";
import { generateUUID } from "../../lib/uuid";
import { useAbortStore } from "../../stores/abort-store";
import { useMessageQueueStore } from "../../stores/message-queue-store";
import { MessageQueue } from "./MessageQueue";

interface ComposeBarProps {
  sessionKey: string;
  chatId: string;
  disabled?: boolean;
  onAddMessage?: (message: ChatMessage) => void;
}

export function ComposeBar({
  sessionKey,
  chatId,
  disabled = false,
  onAddMessage,
}: ComposeBarProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Use individual selectors to avoid re-render on unrelated store changes
  const request = useGatewayRequest();
  const connected = useGatewayConnected();
  const { isStreaming } = useStreaming(sessionKey);
  const { images, addImage, removeImage, clearImages } = useImageAttachments();
  const addToQueue = useMessageQueueStore((state) => state.addToQueue);
  const dequeue = useMessageQueueStore((state) => state.dequeue);
  const { markPending, clearPending } = useAbortStore();

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

  const canSend = connected && !disabled && (text.trim().length > 0 || images.length > 0);

  const handleSend = async (immediate = false) => {
    if (!canSend) return;

    const messageText = text.trim();
    const messageId = generateUUID();
    setText("");
    clearImages();

    klog.compose("handleSend called", {
      sessionKey,
      chatId,
      messageId,
      textLength: messageText.length,
      immediate,
      isStreaming,
    });

    // If agent is streaming and not immediate, queue the message
    if (isStreaming && !immediate) {
      klog.compose("Queueing message (agent is streaming)");
      addToQueue(chatId, messageText);
      // Note: images are not queued, only text messages
      return;
    }

    // If immediate and streaming, abort current run first
    if (immediate && isStreaming) {
      klog.compose("Aborting current run before immediate send");
      try {
        await request("chat.abort", { sessionKey });
      } catch (err) {
        klog.composeError("abort failed:", err);
      }
    }

    // Add user message locally (optimistic update)
    if (onAddMessage) {
      klog.compose("Adding optimistic user message");
      onAddMessage({
        id: messageId,
        role: "user",
        parts: [{ type: "text", text: messageText }],
        createdAt: Date.now(),
        chatId,
      });
    }

    try {
      klog.compose("Sending chat.send request", {
        sessionKey,
        messageId,
        imageCount: images.length,
      });
      // Build attachments array from images
      const attachments = images.map((img) => ({
        type: "image" as const,
        mimeType: "image/jpeg",
        data: img.dataUrl.replace(/^data:image\/[a-z]+;base64,/, ""),
      }));
      const result = await request("chat.send", {
        sessionKey,
        message: messageText,
        deliver: false,
        idempotencyKey: messageId,
        ...(attachments.length > 0 && { attachments }),
      });
      klog.compose("chat.send response:", result);
    } catch (err) {
      klog.composeError("send failed:", err);
      notifications.messageFailed(
        err instanceof Error ? err.message : "Unknown error",
        err instanceof Error ? { message: err.message, stack: err.stack } : undefined,
      );
    }
  };

  const handleSendNow = async () => {
    // Abort current run and send the first queued message
    try {
      await request("chat.abort", { sessionKey });
    } catch (err) {
      console.error("[compose] abort failed:", err);
    }

    const firstMessage = dequeue(chatId);
    if (firstMessage) {
      try {
        await request("chat.send", {
          sessionKey,
          message: firstMessage.text,
          deliver: false,
          idempotencyKey: generateUUID(),
        });
      } catch (err) {
        console.error("[compose] send queued message failed:", err);
      }
    }
  };

  const handleAbort = async () => {
    if (!isStreaming) return;

    klog.compose("handleAbort called", { sessionKey, connected });

    // If not connected, mark as pending for retry after reconnect
    if (!connected) {
      klog.compose("Not connected, marking abort as pending");
      markPending(sessionKey);
      notifications.info("Abort queued", "Will stop when connection is restored");
      return;
    }

    try {
      await request("chat.abort", { sessionKey });
      klog.compose("Abort successful");
      clearPending(sessionKey);
    } catch (err) {
      klog.composeError("Abort failed:", err);
      // Mark as pending for retry
      markPending(sessionKey);
      notifications.error("Failed to stop", err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
      <MessageQueue chatId={chatId} onSendNow={handleSendNow} />
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
                  : disabled
                    ? "Waiting..."
                    : isStreaming
                      ? "Message will be queued..."
                      : "Type a message..."
              }
              disabled={!connected || disabled}
              rows={1}
              className={cn(
                "flex-1 resize-none rounded-md border border-input bg-background px-3 py-2",
                "text-sm placeholder:text-muted-foreground",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "min-h-[40px] max-h-[200px]",
              )}
            />
            {isStreaming ? (
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
