import { beforeEach, describe, expect, it } from "vitest";
import { OpenClawApp } from "./app";
import { createLeaf, splitLeaf } from "./split-tree";
import { createThreadState, type ThreadDescriptor } from "./thread-state";

function makeDescriptor(sessionKey: string, id: string): ThreadDescriptor {
  return {
    id,
    sessionKey,
    label: "",
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    parentSessionKey: sessionKey.split(":thread:")[0] || sessionKey,
  };
}

describe("setThreadInPane", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("switches live session state when replacing the focused pane thread", () => {
    const app = new OpenClawApp();

    const oldSessionKey = "agent:main:main";
    const nextSessionKey = "agent:main:main:thread:new";
    const paneId = "pane-main";

    app.splitLayout = {
      root: createLeaf(oldSessionKey, paneId),
      focusedPaneId: paneId,
    };
    app.focusedPaneId = paneId;
    app.sessionKey = oldSessionKey;
    app.chatMessage = "old draft";
    app.chatMessages = [{ role: "user", content: [{ type: "text", text: "old message" }] }];

    const oldDescriptor = makeDescriptor(oldSessionKey, "thread-old");
    const oldThread = createThreadState(oldDescriptor);
    const nextDescriptor = makeDescriptor(nextSessionKey, "thread-next");
    const nextThread = createThreadState(nextDescriptor);

    app.threads.set(oldDescriptor.id, oldThread);
    app.threads.set(nextDescriptor.id, nextThread);
    app.sessionKeyToThreadId.set(oldSessionKey, oldDescriptor.id);
    app.sessionKeyToThreadId.set(nextSessionKey, nextDescriptor.id);

    app.setThreadInPane(paneId, nextSessionKey);

    expect(app.sessionKey).toBe(nextSessionKey);
    expect(app.chatMessage).toBe("");
    expect(app.chatMessages).toEqual([]);
    const preservedOldThread = Array.from(app.threads.values()).find(
      (thread) => thread.descriptor.sessionKey === oldSessionKey,
    );
    expect(preservedOldThread?.chatMessage).toBe("old draft");
  });

  it("does not switch live session when replacing a non-focused pane thread", () => {
    const app = new OpenClawApp();

    const focusedSessionKey = "agent:main:main";
    const otherSessionKey = "agent:main:main:thread:old";
    const replacementSessionKey = "agent:main:main:thread:new";
    const focusedPaneId = "pane-focused";
    const otherPaneId = "pane-other";

    const root = splitLeaf(
      createLeaf(focusedSessionKey, focusedPaneId),
      focusedPaneId,
      "horizontal",
      otherSessionKey,
    );

    app.splitLayout = {
      root,
      focusedPaneId,
    };
    app.focusedPaneId = focusedPaneId;
    app.sessionKey = focusedSessionKey;
    app.chatMessage = "focused draft";

    const focusedDescriptor = makeDescriptor(focusedSessionKey, "thread-focused");
    const otherDescriptor = makeDescriptor(otherSessionKey, "thread-other");
    const replacementDescriptor = makeDescriptor(replacementSessionKey, "thread-replacement");

    app.threads.set(focusedDescriptor.id, createThreadState(focusedDescriptor));
    app.threads.set(otherDescriptor.id, createThreadState(otherDescriptor));
    app.threads.set(replacementDescriptor.id, createThreadState(replacementDescriptor));
    app.sessionKeyToThreadId.set(focusedSessionKey, focusedDescriptor.id);
    app.sessionKeyToThreadId.set(otherSessionKey, otherDescriptor.id);
    app.sessionKeyToThreadId.set(replacementSessionKey, replacementDescriptor.id);

    app.setThreadInPane(otherPaneId, replacementSessionKey);

    expect(app.sessionKey).toBe(focusedSessionKey);
    expect(app.chatMessage).toBe("focused draft");
  });
});
