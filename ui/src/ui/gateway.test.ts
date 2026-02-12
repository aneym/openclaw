import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GatewayBrowserClient } from "./gateway";

type EventWithData = Event & { data?: string };
type EventWithClose = Event & { code?: number; reason?: string };

class FakeWebSocket extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  closes: Array<{ code: number; reason: string }> = [];

  constructor(_url: string) {
    super();
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }

  emitMessage(frame: unknown) {
    const evt = new Event("message") as EventWithData;
    evt.data = JSON.stringify(frame);
    this.dispatchEvent(evt);
  }

  send(data: string) {
    this.sent.push(String(data));
  }

  close(code?: number, reason?: string) {
    if (this.readyState === FakeWebSocket.CLOSED) {
      return;
    }
    const resolvedCode = typeof code === "number" ? code : 1000;
    const resolvedReason = reason ?? "";
    this.closes.push({ code: resolvedCode, reason: resolvedReason });
    this.readyState = FakeWebSocket.CLOSED;
    const evt = new Event("close") as EventWithClose;
    evt.code = resolvedCode;
    evt.reason = resolvedReason;
    this.dispatchEvent(evt);
  }
}

function latestConnectRequest(ws: FakeWebSocket) {
  const req = ws.sent
    .map((raw) => {
      try {
        return JSON.parse(raw) as {
          type?: string;
          id?: string;
          method?: string;
          params?: { caps?: unknown };
        };
      } catch {
        return null;
      }
    })
    .filter(
      (
        frame,
      ): frame is {
        type?: string;
        id?: string;
        method?: string;
        params?: { caps?: unknown };
      } => frame !== null,
    )
    .toReversed()
    .find((frame) => frame.type === "req" && frame.method === "connect");
  if (!req?.id) {
    throw new Error("connect request not found");
  }
  return req;
}

async function completeConnect(ws: FakeWebSocket, tickIntervalMs = 30_000) {
  let req: { type?: string; id?: string; method?: string } | null = null;
  for (let i = 0; i < 30; i++) {
    vi.advanceTimersByTime(100);
    await Promise.resolve();
    try {
      req = latestConnectRequest(ws);
      break;
    } catch {
      // continue polling until connect frame appears
    }
  }
  if (!req?.id) {
    throw new Error("connect request not found");
  }
  ws.emitMessage({
    type: "res",
    id: req.id,
    ok: true,
    payload: { protocol: 3, policy: { tickIntervalMs } },
  });
  await Promise.resolve();
}

describe("GatewayBrowserClient", () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    vi.useRealTimers();
  });

  it("closes and reconnects when tick timeout is exceeded", async () => {
    const client = new GatewayBrowserClient({ url: "ws://localhost:18789" });
    client.start();

    const ws = FakeWebSocket.instances[0];
    expect(ws).toBeDefined();
    ws.open();
    await completeConnect(ws, 1000);

    vi.advanceTimersByTime(3100);

    expect(ws.closes.some((close) => close.code === 4000 && close.reason === "tick timeout")).toBe(
      true,
    );
  });

  it("resets sequence tracking after reconnect so first event on new socket does not gap", async () => {
    const onGap = vi.fn();
    const client = new GatewayBrowserClient({ url: "ws://localhost:18789", onGap });
    client.start();

    const ws1 = FakeWebSocket.instances[0];
    ws1.open();
    await completeConnect(ws1);
    ws1.emitMessage({ type: "event", event: "presence", seq: 1, payload: {} });

    ws1.close(1006, "network reset");
    vi.advanceTimersByTime(801);

    const ws2 = FakeWebSocket.instances[1];
    expect(ws2).toBeDefined();
    ws2.open();
    await completeConnect(ws2);
    ws2.emitMessage({ type: "event", event: "presence", seq: 100, payload: {} });

    expect(onGap).not.toHaveBeenCalled();
  });

  it("advertises tool-events capability on connect", async () => {
    const client = new GatewayBrowserClient({ url: "ws://localhost:18789" });
    client.start();

    const ws = FakeWebSocket.instances[0];
    ws.open();
    await completeConnect(ws);

    const connect = latestConnectRequest(ws);
    const caps = Array.isArray(connect.params?.caps) ? connect.params?.caps : [];
    expect(caps).toContain("tool-events");
  });
});
