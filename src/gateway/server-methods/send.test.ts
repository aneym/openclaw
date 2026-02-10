import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import { ErrorCodes } from "../protocol/index.js";
import { sendHandlers } from "./send.js";

const mocks = vi.hoisted(() => ({
  deliverOutboundPayloads: vi.fn(),
  resolveOutboundTarget: vi.fn(),
  appendAssistantMessageToSessionTranscript: vi.fn(async () => ({ ok: true, sessionFile: "x" })),
  recordSessionMetaFromInbound: vi.fn(async () => ({ ok: true })),
}));

vi.mock("../../config/config.js", async () => {
  const actual =
    await vi.importActual<typeof import("../../config/config.js")>("../../config/config.js");
  return {
    ...actual,
    loadConfig: () => ({}),
  };
});

vi.mock("../../channels/plugins/index.js", () => ({
  getChannelPlugin: () => ({ outbound: {} }),
  normalizeChannelId: (value: string) => value,
}));

vi.mock("../../infra/outbound/targets.js", () => ({
  resolveOutboundTarget: (...args: unknown[]) => mocks.resolveOutboundTarget(...args),
}));

vi.mock("../../infra/outbound/deliver.js", () => ({
  deliverOutboundPayloads: mocks.deliverOutboundPayloads,
}));

vi.mock("../../config/sessions.js", async () => {
  const actual = await vi.importActual<typeof import("../../config/sessions.js")>(
    "../../config/sessions.js",
  );
  return {
    ...actual,
    appendAssistantMessageToSessionTranscript: mocks.appendAssistantMessageToSessionTranscript,
    recordSessionMetaFromInbound: mocks.recordSessionMetaFromInbound,
  };
});

const makeContext = (): GatewayRequestContext =>
  ({
    dedupe: new Map(),
  }) as unknown as GatewayRequestContext;

describe("gateway send mirroring", () => {
  beforeEach(() => {
    mocks.deliverOutboundPayloads.mockReset();
    mocks.resolveOutboundTarget.mockReset();
    mocks.appendAssistantMessageToSessionTranscript.mockClear();
    mocks.recordSessionMetaFromInbound.mockClear();
    mocks.resolveOutboundTarget.mockImplementation((params: { to?: string }) => ({
      ok: true,
      to: params?.to?.trim() || "resolved",
    }));
  });

  it("does not mirror when delivery returns no results", async () => {
    mocks.deliverOutboundPayloads.mockResolvedValue([]);

    const respond = vi.fn();
    await sendHandlers.send({
      params: {
        to: "channel:C1",
        message: "hi",
        channel: "slack",
        idempotencyKey: "idem-1",
        sessionKey: "agent:main:main",
      },
      respond,
      context: makeContext(),
      req: { type: "req", id: "1", method: "send" },
      client: null,
      isWebchatConnect: () => false,
    });

    expect(mocks.deliverOutboundPayloads).toHaveBeenCalledWith(
      expect.objectContaining({
        mirror: expect.objectContaining({
          sessionKey: "agent:main:main",
        }),
      }),
    );
  });

  it("mirrors media filenames when delivery succeeds", async () => {
    mocks.deliverOutboundPayloads.mockResolvedValue([{ messageId: "m1", channel: "slack" }]);

    const respond = vi.fn();
    await sendHandlers.send({
      params: {
        to: "channel:C1",
        message: "caption",
        mediaUrl: "https://example.com/files/report.pdf?sig=1",
        channel: "slack",
        idempotencyKey: "idem-2",
        sessionKey: "agent:main:main",
      },
      respond,
      context: makeContext(),
      req: { type: "req", id: "1", method: "send" },
      client: null,
      isWebchatConnect: () => false,
    });

    expect(mocks.deliverOutboundPayloads).toHaveBeenCalledWith(
      expect.objectContaining({
        mirror: expect.objectContaining({
          sessionKey: "agent:main:main",
          text: "caption",
          mediaUrls: ["https://example.com/files/report.pdf?sig=1"],
        }),
      }),
    );
  });

  it("mirrors MEDIA tags as attachments", async () => {
    mocks.deliverOutboundPayloads.mockResolvedValue([{ messageId: "m2", channel: "slack" }]);

    const respond = vi.fn();
    await sendHandlers.send({
      params: {
        to: "channel:C1",
        message: "Here\nMEDIA:https://example.com/image.png",
        channel: "slack",
        idempotencyKey: "idem-3",
        sessionKey: "agent:main:main",
      },
      respond,
      context: makeContext(),
      req: { type: "req", id: "1", method: "send" },
      client: null,
      isWebchatConnect: () => false,
    });

    expect(mocks.deliverOutboundPayloads).toHaveBeenCalledWith(
      expect.objectContaining({
        mirror: expect.objectContaining({
          sessionKey: "agent:main:main",
          text: "Here",
          mediaUrls: ["https://example.com/image.png"],
        }),
      }),
    );
  });

  it("lowercases provided session keys for mirroring", async () => {
    mocks.deliverOutboundPayloads.mockResolvedValue([{ messageId: "m-lower", channel: "slack" }]);

    const respond = vi.fn();
    await sendHandlers.send({
      params: {
        to: "channel:C1",
        message: "hi",
        channel: "slack",
        idempotencyKey: "idem-lower",
        sessionKey: "agent:main:slack:channel:C123",
      },
      respond,
      context: makeContext(),
      req: { type: "req", id: "1", method: "send" },
      client: null,
      isWebchatConnect: () => false,
    });

    expect(mocks.deliverOutboundPayloads).toHaveBeenCalledWith(
      expect.objectContaining({
        mirror: expect.objectContaining({
          sessionKey: "agent:main:slack:channel:c123",
        }),
      }),
    );
  });

  it("derives a target session key when none is provided", async () => {
    mocks.deliverOutboundPayloads.mockResolvedValue([{ messageId: "m3", channel: "slack" }]);

    const respond = vi.fn();
    await sendHandlers.send({
      params: {
        to: "channel:C1",
        message: "hello",
        channel: "slack",
        idempotencyKey: "idem-4",
      },
      respond,
      context: makeContext(),
      req: { type: "req", id: "1", method: "send" },
      client: null,
      isWebchatConnect: () => false,
    });

    expect(mocks.recordSessionMetaFromInbound).toHaveBeenCalled();
    expect(mocks.deliverOutboundPayloads).toHaveBeenCalledWith(
      expect.objectContaining({
        mirror: expect.objectContaining({
          sessionKey: "agent:main:slack:channel:c1",
          agentId: "main",
        }),
      }),
    );
  });

  it("serializes sends for the same target", async () => {
    let releaseFirst: (() => void) | undefined;
    const firstSendStarted = new Promise<void>((resolve) => {
      mocks.deliverOutboundPayloads
        .mockImplementationOnce(async () => {
          resolve();
          await new Promise<void>((release) => {
            releaseFirst = release;
          });
          return [{ messageId: "m-first", channel: "telegram" }];
        })
        .mockResolvedValueOnce([{ messageId: "m-second", channel: "telegram" }]);
    });

    const context = makeContext();
    const respondFirst = vi.fn();
    const respondSecond = vi.fn();

    const first = sendHandlers.send({
      params: {
        to: "123456789",
        message: "first",
        channel: "telegram",
        idempotencyKey: "idem-order-1",
      },
      respond: respondFirst,
      context,
      req: { type: "req", id: "1", method: "send" },
      client: null,
      isWebchatConnect: () => false,
    });

    await firstSendStarted;

    const second = sendHandlers.send({
      params: {
        to: "123456789",
        message: "second",
        channel: "telegram",
        idempotencyKey: "idem-order-2",
      },
      respond: respondSecond,
      context,
      req: { type: "req", id: "2", method: "send" },
      client: null,
      isWebchatConnect: () => false,
    });

    await Promise.resolve();
    expect(mocks.deliverOutboundPayloads).toHaveBeenCalledTimes(1);

    releaseFirst?.();
    await Promise.all([first, second]);

    expect(mocks.deliverOutboundPayloads).toHaveBeenCalledTimes(2);
    expect(mocks.deliverOutboundPayloads.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        to: "123456789",
        payloads: [{ text: "first", mediaUrl: undefined, mediaUrls: undefined }],
      }),
    );
    expect(mocks.deliverOutboundPayloads.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        to: "123456789",
        payloads: [{ text: "second", mediaUrl: undefined, mediaUrls: undefined }],
      }),
    );
    expect(respondFirst).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        runId: "idem-order-1",
        messageId: "m-first",
        _targetQueue: expect.objectContaining({ sequence: 1 }),
      }),
      undefined,
      expect.objectContaining({ targetQueueSequence: 1 }),
    );
    expect(respondSecond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        runId: "idem-order-2",
        messageId: "m-second",
        _targetQueue: expect.objectContaining({ sequence: 2 }),
      }),
      undefined,
      expect.objectContaining({ targetQueueSequence: 2 }),
    );
  });

  it("does not block sends across different targets", async () => {
    let releaseFirst: (() => void) | undefined;
    const firstSendStarted = new Promise<void>((resolve) => {
      const impl = vi
        .fn()
        .mockImplementation(
          async (params: { to?: string; payloads?: Array<{ text?: string }> }) => {
            if (params.to === "target-a") {
              resolve();
              await new Promise<void>((release) => {
                releaseFirst = release;
              });
              return [{ messageId: "m-a", channel: "telegram" }];
            }
            return [{ messageId: "m-b", channel: "telegram" }];
          },
        );
      mocks.deliverOutboundPayloads.mockImplementation(impl);
    });

    const context = makeContext();
    const respondFirst = vi.fn();
    const respondSecond = vi.fn();

    const first = sendHandlers.send({
      params: {
        to: "target-a",
        message: "first",
        channel: "telegram",
        idempotencyKey: "idem-target-a",
      },
      respond: respondFirst,
      context,
      req: { type: "req", id: "1", method: "send" },
      client: null,
      isWebchatConnect: () => false,
    });

    await firstSendStarted;

    const second = sendHandlers.send({
      params: {
        to: "target-b",
        message: "second",
        channel: "telegram",
        idempotencyKey: "idem-target-b",
      },
      respond: respondSecond,
      context,
      req: { type: "req", id: "2", method: "send" },
      client: null,
      isWebchatConnect: () => false,
    });

    await Promise.resolve();
    await second;

    expect(mocks.deliverOutboundPayloads).toHaveBeenCalledTimes(2);
    expect(mocks.deliverOutboundPayloads.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        to: "target-a",
      }),
    );
    expect(mocks.deliverOutboundPayloads.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        to: "target-b",
      }),
    );
    expect(respondSecond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ runId: "idem-target-b", messageId: "m-b" }),
      undefined,
      expect.objectContaining({ targetQueueSequence: 1 }),
    );

    releaseFirst?.();
    await first;
  });

  it("captures outbound traces and filters by channel", async () => {
    const context = makeContext();

    mocks.deliverOutboundPayloads
      .mockResolvedValueOnce([{ messageId: "tg-1", channel: "telegram" }])
      .mockResolvedValueOnce([{ messageId: "sl-1", channel: "slack" }]);

    await sendHandlers.send({
      params: {
        to: "123",
        message: "one",
        channel: "telegram",
        idempotencyKey: "idem-trace-telegram",
      },
      respond: vi.fn(),
      context,
      req: { type: "req", id: "1", method: "send" },
      client: null,
      isWebchatConnect: () => false,
    });

    await sendHandlers.send({
      params: {
        to: "C123",
        message: "two",
        channel: "slack",
        idempotencyKey: "idem-trace-slack",
      },
      respond: vi.fn(),
      context,
      req: { type: "req", id: "2", method: "send" },
      client: null,
      isWebchatConnect: () => false,
    });

    const respondTrace = vi.fn();
    sendHandlers["send.trace"]({
      params: { channel: "telegram", limit: 10 },
      respond: respondTrace,
      context,
      req: { type: "req", id: "3", method: "send.trace" },
      client: null,
      isWebchatConnect: () => false,
    });

    expect(respondTrace).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        totalBuffered: 2,
        entries: [
          expect.objectContaining({
            method: "send",
            channel: "telegram",
            idempotencyKey: "idem-trace-telegram",
            status: "ok",
            messageId: "tg-1",
          }),
        ],
      }),
      undefined,
    );
  });

  it("rejects invalid send.trace status filters", () => {
    const respondTrace = vi.fn();
    sendHandlers["send.trace"]({
      params: { status: "pending" },
      respond: respondTrace,
      context: makeContext(),
      req: { type: "req", id: "4", method: "send.trace" },
      client: null,
      isWebchatConnect: () => false,
    });

    expect(respondTrace).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.INVALID_REQUEST,
        message: "status must be ok|error",
      }),
    );
  });
});
