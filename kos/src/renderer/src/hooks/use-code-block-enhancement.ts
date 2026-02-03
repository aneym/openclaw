/**
 * useCodeBlockEnhancement hook — adds copy buttons and language labels to code blocks.
 * Extracts DOM manipulation logic from TextPart for cleaner component code.
 */

import { useCallback } from "react";

const COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;

const CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-500"><path d="M20 6 9 17l-5-5"/></svg>`;

/**
 * Creates a ref callback that enhances code blocks with:
 * - Copy button (appears on hover)
 * - Language label (top-left)
 */
export function useCodeBlockEnhancement() {
  const enhanceCodeBlocks = useCallback((container: HTMLDivElement | null) => {
    if (!container) return;

    const codeBlocks = container.querySelectorAll(".code-block-wrapper");
    codeBlocks.forEach((block) => {
      const htmlBlock = block as HTMLElement;
      const encodedCode = htmlBlock.dataset.code;
      const lang = htmlBlock.dataset.lang || "";

      // Skip if already enhanced
      if (encodedCode && !htmlBlock.querySelector(".copy-button-container")) {
        try {
          const code = decodeURIComponent(encodedCode);

          // Add group class for hover effect
          htmlBlock.classList.add("group", "relative");

          // Create button container marker
          const buttonContainer = document.createElement("div");
          buttonContainer.className = "copy-button-container";
          htmlBlock.appendChild(buttonContainer);

          // Create language label
          if (lang) {
            const langLabel = document.createElement("div");
            langLabel.className =
              "absolute top-2 left-2 text-xs text-muted-foreground bg-background/80 px-2 py-0.5 rounded border border-border";
            langLabel.textContent = lang;
            htmlBlock.appendChild(langLabel);
          }

          // Create copy button
          const copyButton = document.createElement("button");
          copyButton.className =
            "absolute top-2 right-2 p-1.5 rounded-md bg-background/80 hover:bg-background border border-border opacity-0 group-hover:opacity-100 transition-opacity";
          copyButton.setAttribute("aria-label", "Copy code");
          copyButton.setAttribute("title", "Copy code");
          copyButton.innerHTML = COPY_ICON;

          copyButton.addEventListener("click", async () => {
            try {
              await navigator.clipboard.writeText(code);
              copyButton.innerHTML = CHECK_ICON;
              setTimeout(() => {
                copyButton.innerHTML = COPY_ICON;
              }, 2000);
            } catch (err) {
              console.error("Failed to copy code:", err);
            }
          });

          htmlBlock.appendChild(copyButton);
        } catch (err) {
          console.error("Failed to decode code:", err);
        }
      }
    });
  }, []);

  return enhanceCodeBlocks;
}
