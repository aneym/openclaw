import { describe, expect, it } from "vitest";
import type { ReplyPayload } from "../types.js";
import { buildReplyPayloads } from "./agent-runner-payloads.js";

describe("buildReplyPayloads - collapseReplies", () => {
  const baseParams = {
    isHeartbeat: false,
    didLogHeartbeatStrip: false,
    blockStreamingEnabled: false,
    blockReplyPipeline: null,
    replyToMode: "off" as const,
  };

  it("when collapseReplies: 'last' with multiple text payloads → only last text payload returned", () => {
    const payloads: ReplyPayload[] = [
      { text: "First message" },
      { text: "Second message" },
      { text: "Third message" },
    ];

    const result = buildReplyPayloads({
      ...baseParams,
      payloads,
      collapseReplies: "last",
    });

    expect(result.replyPayloads).toHaveLength(1);
    expect(result.replyPayloads[0].text).toBe("Third message");
  });

  it("when collapseReplies: 'last' with single payload → unchanged", () => {
    const payloads: ReplyPayload[] = [{ text: "Only message" }];

    const result = buildReplyPayloads({
      ...baseParams,
      payloads,
      collapseReplies: "last",
    });

    expect(result.replyPayloads).toHaveLength(1);
    expect(result.replyPayloads[0].text).toBe("Only message");
  });

  it("when collapseReplies: 'last' with media-only payloads → media preserved + last text", () => {
    const payloads: ReplyPayload[] = [
      { text: "First text" },
      { mediaUrl: "http://example.com/image1.jpg" },
      { text: "Second text" },
      { mediaUrls: ["http://example.com/image2.jpg"] },
      { text: "Third text" },
    ];

    const result = buildReplyPayloads({
      ...baseParams,
      payloads,
      collapseReplies: "last",
    });

    expect(result.replyPayloads).toHaveLength(3);
    // Media payloads should be preserved
    expect(result.replyPayloads.some((p) => p.mediaUrl === "http://example.com/image1.jpg")).toBe(
      true,
    );
    expect(
      result.replyPayloads.some((p) => p.mediaUrls?.[0] === "http://example.com/image2.jpg"),
    ).toBe(true);
    // Only last text should be preserved
    expect(result.replyPayloads.some((p) => p.text === "Third text")).toBe(true);
    expect(result.replyPayloads.some((p) => p.text === "First text")).toBe(false);
    expect(result.replyPayloads.some((p) => p.text === "Second text")).toBe(false);
  });

  it("when collapseReplies: 'off' → all payloads returned (no change)", () => {
    const payloads: ReplyPayload[] = [
      { text: "First message" },
      { text: "Second message" },
      { text: "Third message" },
    ];

    const result = buildReplyPayloads({
      ...baseParams,
      payloads,
      collapseReplies: "off",
    });

    expect(result.replyPayloads).toHaveLength(3);
    expect(result.replyPayloads[0].text).toBe("First message");
    expect(result.replyPayloads[1].text).toBe("Second message");
    expect(result.replyPayloads[2].text).toBe("Third message");
  });

  it("when collapseReplies: undefined → all payloads returned (no change)", () => {
    const payloads: ReplyPayload[] = [
      { text: "First message" },
      { text: "Second message" },
      { text: "Third message" },
    ];

    const result = buildReplyPayloads({
      ...baseParams,
      payloads,
      collapseReplies: undefined,
    });

    expect(result.replyPayloads).toHaveLength(3);
    expect(result.replyPayloads[0].text).toBe("First message");
    expect(result.replyPayloads[1].text).toBe("Second message");
    expect(result.replyPayloads[2].text).toBe("Third message");
  });

  it("when collapseReplies: 'last' with empty payloads → empty array", () => {
    const payloads: ReplyPayload[] = [];

    const result = buildReplyPayloads({
      ...baseParams,
      payloads,
      collapseReplies: "last",
    });

    expect(result.replyPayloads).toHaveLength(0);
  });

  it("when collapseReplies: 'last' with only media payloads → all media preserved", () => {
    const payloads: ReplyPayload[] = [
      { mediaUrl: "http://example.com/image1.jpg" },
      { mediaUrls: ["http://example.com/image2.jpg"] },
    ];

    const result = buildReplyPayloads({
      ...baseParams,
      payloads,
      collapseReplies: "last",
    });

    expect(result.replyPayloads).toHaveLength(2);
    expect(result.replyPayloads[0].mediaUrl).toBe("http://example.com/image1.jpg");
    expect(result.replyPayloads[1].mediaUrls?.[0]).toBe("http://example.com/image2.jpg");
  });

  it("when collapseReplies: 'last' with whitespace-only text → treated as non-text", () => {
    const payloads: ReplyPayload[] = [
      { text: "First message" },
      { text: "   " }, // whitespace-only
      { text: "Second message" },
    ];

    const result = buildReplyPayloads({
      ...baseParams,
      payloads,
      collapseReplies: "last",
    });

    expect(result.replyPayloads).toHaveLength(1);
    expect(result.replyPayloads[0].text).toBe("Second message");
  });

  it("when collapseReplies: 'last' with payload containing both text and media → preserved if last text", () => {
    const payloads: ReplyPayload[] = [
      { text: "First message" },
      { text: "Second message", mediaUrl: "http://example.com/image.jpg" },
    ];

    const result = buildReplyPayloads({
      ...baseParams,
      payloads,
      collapseReplies: "last",
    });

    expect(result.replyPayloads).toHaveLength(1);
    expect(result.replyPayloads[0].text).toBe("Second message");
    expect(result.replyPayloads[0].mediaUrl).toBe("http://example.com/image.jpg");
  });
});
