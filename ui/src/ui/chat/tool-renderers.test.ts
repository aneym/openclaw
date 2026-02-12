import { describe, expect, it } from "vitest";
import {
  extractToolResultEntries,
  messageHasImageToolPreview,
  messageHasRichToolPreview,
} from "./tool-renderers.ts";

describe("tool-renderers", () => {
  it("pairs tool_result blocks with preceding tool_call args", () => {
    const message = {
      role: "assistant",
      content: [
        { type: "toolcall", name: "exec", arguments: { command: "ls -la" } },
        { type: "toolresult", name: "exec", text: "ok" },
      ],
    };

    const [entry] = extractToolResultEntries(message);
    expect(entry).toMatchObject({
      name: "exec",
      text: "ok",
      callArgs: { command: "ls -la" },
    });
  });

  it("detects image preview availability for dedicated image display tools", () => {
    const message = {
      role: "assistant",
      toolCallId: "tc-1",
      content: [
        { type: "toolcall", name: "display_image", arguments: { path: "/tmp/openclaw-test.png" } },
        { type: "toolresult", name: "display_image", text: "MEDIA:/tmp/openclaw-test.png" },
      ],
    };

    expect(messageHasImageToolPreview(message)).toBe(true);
  });

  it("does not treat exec MEDIA output as an image preview card", () => {
    const message = {
      role: "assistant",
      toolCallId: "tc-1",
      content: [
        { type: "toolcall", name: "exec", arguments: { command: "echo hi" } },
        { type: "toolresult", name: "exec", text: "MEDIA:/tmp/openclaw-test.png" },
      ],
    };

    expect(messageHasImageToolPreview(message)).toBe(false);
  });

  it("detects media preview availability for display_asset video output", () => {
    const message = {
      role: "assistant",
      toolCallId: "tc-1",
      content: [
        {
          type: "toolcall",
          name: "display_asset",
          arguments: { path: "https://example.com/preview.mp4", kind: "video" },
        },
        { type: "toolresult", name: "display_asset", text: "FILE:https://example.com/preview.mp4" },
      ],
    };

    expect(messageHasRichToolPreview(message)).toBe(true);
  });
});
