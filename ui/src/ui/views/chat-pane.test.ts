import { afterEach, describe, expect, it } from "vitest";
import { hasNonEmptyTextSelectionInElement } from "./chat-pane";

function clearSelection() {
  window.getSelection()?.removeAllRanges();
}

function selectContents(node: Node) {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
}

describe("chat pane selection guard", () => {
  afterEach(() => {
    clearSelection();
    document.body.innerHTML = "";
  });

  it("returns false when there is no text selection", () => {
    const pane = document.createElement("div");
    pane.textContent = "pane";
    document.body.appendChild(pane);

    clearSelection();

    expect(hasNonEmptyTextSelectionInElement(pane)).toBe(false);
  });

  it("returns true when selected text is inside the pane", () => {
    const pane = document.createElement("div");
    const bubble = document.createElement("div");
    bubble.textContent = "copy this text";
    pane.appendChild(bubble);
    document.body.appendChild(pane);

    selectContents(bubble);

    expect(hasNonEmptyTextSelectionInElement(pane)).toBe(true);
  });

  it("returns false when selected text is outside the pane", () => {
    const pane = document.createElement("div");
    pane.textContent = "pane";
    const external = document.createElement("div");
    external.textContent = "outside selection";
    document.body.appendChild(pane);
    document.body.appendChild(external);

    selectContents(external);

    expect(hasNonEmptyTextSelectionInElement(pane)).toBe(false);
  });
});
