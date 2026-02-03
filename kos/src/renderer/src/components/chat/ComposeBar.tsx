import { Send, X } from "lucide-react";
import { useState, useRef, KeyboardEvent, ClipboardEvent } from "react";
import { useAutoResizeTextarea } from "../../hooks/use-auto-resize-textarea";
import { useImageAttachments } from "../../hooks/use-image-attachments";
import { useStreaming } from "../../hooks/use-streaming";
import { cn } from "../../lib/utils";
import { generateUUID } from "../../lib/uuid";
import { useGatewayStore } from "../../stores/gateway-store";
import { useMessageQueueStore } from "../../stores/message-queue-store";
import { MessageQueue } from "./MessageQueue";

interface ComposeBarProps {
  sessionKey: string;
  threadId: string;
  disabled?: boolean;
}

export function ComposeBar({ sessionKey, threadId, disabled = false }: ComposeBarProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { request, connected } = useGatewayStore();
  const { isStreaming } = useStreaming(sessionKey);
  const { images, addImage, removeImage, clearImages } = useImageAttachments();
  const addToQueue = useMessageQueueStore((state) => state.addToQueue);
  const dequeue = useMessageQueueStore((state) => state.dequeue);

  // Auto-resize textarea based on content
  useAutoResizeTextarea(textareaRef, text);

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
    setText("");
    clearImages();

    // If agent is streaming and not immediate, queue the message
    if (isStreaming && !immediate) {
      addToQueue(threadId, messageText);
      // Note: images are not queued, only text messages
      return;
    }

    // If immediate and streaming, abort current run first
    if (immediate && isStreaming) {
      try {
        await request("chat.abort", { sessionKey });
      } catch (err) {
        console.error("[compose] abort failed:", err);
      }
    }

    try {
      // TODO: Add image attachments support
      await request("chat.send", {
        sessionKey,
        message: messageText,
        deliver: false,
        idempotencyKey: generateUUID(),
      });
    } catch (err) {
      console.error("[compose] send failed:", err);
    }
  };

  const handleSendNow = async () => {
    // Abort current run and send the first queued message
    try {
      await request("chat.abort", { sessionKey });
    } catch (err) {
      console.error("[compose] abort failed:", err);
    }

    const firstMessage = dequeue(threadId);
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
      <MessageQueue threadId={threadId} onSendNow={handleSendNow} />
      <div className="border-t border-border bg-background p-3">
        <div className="space-y-2">
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
          </div>
        </div>
      </div>
    </>
  );
}
