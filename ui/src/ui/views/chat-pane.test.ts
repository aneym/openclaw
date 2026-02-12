import { afterEach, describe, expect, it } from "vitest";
import { hasNonEmptyTextSelectionInElement, isPaneStreamingState } from "./chat-pane";

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

describe("isPaneStreamingState", () => {
  it("returns true for active pane when chatRunId is set even with empty stream text", () => {
    const runningSessions = new Set<string>();
    const streaming = isPaneStreamingState({
      sessionKey: "main",
      isActiveSession: true,
      state: { chatRunId: "run-1", runningSessions },
      thread: null,
    });
    expect(streaming).toBe(true);
  });

  it("returns true for non-focused pane when runningSessions marks the session active", () => {
    const runningSessions = new Set<string>(["agent:main:thread:123"]);
    const streaming = isPaneStreamingState({
      sessionKey: "agent:main:thread:123",
      isActiveSession: false,
      state: { chatRunId: null, runningSessions },
      thread: { chatRunId: null },
    });
    expect(streaming).toBe(true);
  });

  it("returns false when neither run state nor runningSessions indicate activity", () => {
    const runningSessions = new Set<string>();
    const streaming = isPaneStreamingState({
      sessionKey: "main",
      isActiveSession: false,
      state: { chatRunId: null, runningSessions },
      thread: { chatRunId: null },
    });
    expect(streaming).toBe(false);
  });
});
