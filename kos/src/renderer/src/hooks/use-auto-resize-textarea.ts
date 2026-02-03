/**
 * useAutoResizeTextarea hook — auto-resizes a textarea based on content.
 */

import { useEffect, RefObject } from "react";

const DEFAULT_MAX_HEIGHT = 200;

export function useAutoResizeTextarea(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  value: string,
  maxHeight = DEFAULT_MAX_HEIGHT,
) {
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = "auto";

    // Set height based on content, capped at maxHeight
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${newHeight}px`;
  }, [textareaRef, value, maxHeight]);
}
