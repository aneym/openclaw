/**
 * DraggableChatItem
 *
 * Wrapper that makes a chat/thread item in the sidebar draggable.
 */

import type { ReactNode } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { ThreadDragData } from "../../lib/panel-dnd";
import type { Chat } from "../../types";
import { cn } from "../../lib/utils";

interface DraggableChatItemProps {
  chat: Chat;
  children: ReactNode;
}

export function DraggableChatItem({ chat, children }: DraggableChatItemProps) {
  const dragData: ThreadDragData = {
    type: "thread",
    chatId: chat.id,
    title: chat.title,
  };

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `thread-${chat.id}`,
    data: dragData,
  });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 1000 : undefined,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(isDragging && "cursor-grabbing")}
    >
      {children}
    </div>
  );
}
