import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import type { SessionsListResult } from "../types";
import { renderChat, type ChatProps } from "./chat";

function createSessions(): SessionsListResult {
  return {
    ts: 0,
    path: "",
    count: 0,
    defaults: { model: null, contextTokens: null },
    sessions: [],
  };
}

function createProps(overrides: Partial<ChatProps> = {}): ChatProps {
  return {
    sessionKey: "main",
    onSessionKeyChange: () => undefined,
    thinkingLevel: null,
    showThinking: false,
    loading: false,
    sending: false,
    canAbort: false,
    compactionStatus: null,
    messages: [],
    toolMessages: [],
    stream: null,
    streamStartedAt: null,
    assistantAvatarUrl: null,
    draft: "",
    queue: [],
    connected: true,
    canSend: true,
    disabledReason: null,
    error: null,
    sessions: createSessions(),
    focusMode: false,
    assistantName: "OpenClaw",
    assistantAvatar: null,
    onRefresh: () => undefined,
    onToggleFocusMode: () => undefined,
    onDraftChange: () => undefined,
    onSend: () => undefined,
    onQueueRemove: () => undefined,
    onQueueSendNow: () => undefined,
    onQueueClearAll: () => undefined,
    onSendImmediately: () => undefined,
    onNewSession: () => undefined,
    ...overrides,
  };
}

describe("chat view", () => {
  it("shows a stop button when aborting is available", () => {
    const container = document.createElement("div");
    const onAbort = vi.fn();
    render(
      renderChat(
        createProps({
          canAbort: true,
          onAbort,
        }),
      ),
      container,
    );

    // Compose buttons are icon-only; find by title attribute
    const stopButton = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.getAttribute("title") === "Stop",
    );
    expect(stopButton).not.toBeUndefined();
    stopButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it("renders compose actions without send-now when not busy", () => {
    const container = document.createElement("div");
    render(
      renderChat(
        createProps({
          canAbort: false,
          sending: false,
          stream: null,
        }),
      ),
      container,
    );

    // The send button should show "Send" title (not "Queue")
    const sendButton = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.getAttribute("title") === "Send",
    );
    expect(sendButton).not.toBeUndefined();

    // No "Send Now" button when not busy
    const sendNowButton = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.getAttribute("title")?.includes("send now"),
    );
    expect(sendNowButton).toBeUndefined();
  });
});
